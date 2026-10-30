// svc-qc-done-pos-scene.mts — SVC B.10 · ฉากจบงาน → บิลจากคิว (ภาพ จอง 07 ก/ข) บนร้าน svcqc หน่วยบาร์เบอร์
//
// ใช้:
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-done-pos-scene.mts            # สร้าง/ปรับฉาก วัน X + วัน Y
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-done-pos-scene.mts --clear    # ลบงานฉาก + บิลพักของงานฉาก
//
// ฉาก (ใบสั่ง svc-brief-b.10 §6 · ข้อมูล SQC_DONE_POS_SCENE):
//   วัน X = SQC_DONE_POS_SCENE_DAYS.x (วันฉาก B.6 + 7): SQC_TODAY_LINE_SCENE ทั้งวัน + P004 รับมัดจำ ฿200 (PROMPTPAY) ก่อนเช็กอิน +
//          A008 เสร็จ 14:41 + P004 เสร็จ 15:01 พร้อม ทรีตเมนต์บำรุงสี + แว็กซ์จัดแต่งทรง (ผู้ทำ ช่างเอก) · บิลจากคิวอื่นของวันจ่ายแล้ว
//          (เหลือ P004 ฿1,290 + A008 ฿180 รอที่เคาน์เตอร์ · ภาพ ข --user cashier · ?at= 15:02)
//   วัน Y = X + 7: ฉากเดียวกันถึง 15:01 แต่ P004 ยังไม่กดเสร็จ (ภาพ ก --user ek · ?finish=P004&add=… · ?at= 15:01)
//   ค่าคอมฯ ร้าน = SQC_BOOKING_SETTINGS_SCENE.barber.unitDiffs (บริการ 10% · สินค้า 5%) · ช่างเอกผูก HR ตาม SQC_TODAY_LINE_SCENE.hrLink
//   id ตายตัว: บริการ SQC_DONE_POS_SCENE.extras.treatment.id (BookingService ของหน่วยบาร์เบอร์) · สินค้า extras.wax.id (PosProduct ของ svcqc-sys-pos)
// idempotent: ครบแล้ว ⇒ ไม่สร้างใหม่ · ไม่ครบ ⇒ ลบงาน + บัตร + บิลพักของวันฉากแล้วสร้างใหม่ (บิลขายที่จ่ายไปแล้วของรอบก่อนคงอยู่ — ใบเสร็จมีเลขแล้ว ห้ามลบ)
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv) · QC server เปิดด้วย SVC_QC_CLOCK=1
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import {
  SQC,
  SQC_TODAY_LINE_SCENE as SCENE,
  SQC_DONE_POS_SCENE as DPS,
  SQC_DONE_POS_SCENE_DAYS as DAYS,
  SQC_BOOKING_SETTINGS_SCENE as BSS,
  SQC_SYSTEMS,
  type SqcLineEvent,
} from "./svc-qc-data.mjs";

const LABEL = "svc-qc-done-pos-scene";
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
const { applyTemplate, setSettings, resolveSettings } = await import("@/lib/core/settings");
const { bookAppointment, setAppointmentStatus, recordDeposit } = await import("@/lib/modules/booking/service");
const { checkIn, createWalkIn, startJob, cancelByShop } = await import("@/lib/modules/booking/queue-line");
const { finishJob } = await import("@/lib/modules/booking/finish");
const { runLineTick, runPlanner } = await import("@/lib/modules/booking/planner-run");
const { serviceBills } = await import("@/lib/modules/pos");

const tenantId = SQC.tenant.id;
const unitId = SQC.units.barber.id;
const posSystemId = SQC_SYSTEMS.POS.id;
const ctx = { tenantId, unitId };
const KEY_PREFIX = "svcqc-b10-";
const keyOf = (day: string, k: string) => `${KEY_PREFIX}${day}-${k}`;
const owner = SQC.users.find((u) => u.key === "owner")!;
const cashier = SQC.users.find((u) => u.key === "cashier")!;
const OWNER = { role: "OWNER" as const, unitAccess: ["*"], permissions: {}, userId: owner.userId };
const CASHIER = { role: "STAFF" as const, unitAccess: [unitId], permissions: { "pos.sale.create": true }, userId: cashier.userId };
const hr = SCENE.hrLink;
const hrUser = SQC.users.find((u) => u.key === hr.userKey)!;
const ekStaffId = SCENE.staffIds[hr.staff];
const P004 = "P004";
const A008 = "A008";

const hm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
const at = (ds: string, s: string) => {
  const [y, mo, d] = ds.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d) + (hm(s) - 420) * 60_000);
};
const dayRange = (ds: string) => ({ gte: at(ds, "00:00"), lt: new Date(at(ds, "00:00").getTime() + 86_400_000) });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sum = { created: 0, updated: 0, removed: 0 };

/** tick เฉพาะวันฉาก (แบบฉาก B.6): ซ่อน walk-in QUEUED ของวันก่อนหน้าระหว่าง tick ⇒ ฉากวันอื่นไม่ถูกกวาดสิ้นวัน */
async function tickSceneDay(now: Date, ds: string): Promise<void> {
  const hidden = (await prisma.appointment.findMany({ where: { tenantId, unitId, kind: "WALKIN", status: "QUEUED", startAt: { lt: at(ds, "00:00") } }, select: { id: true } })).map((a) => a.id);
  if (hidden.length) await prisma.$executeRaw`UPDATE "Appointment" SET "kind" = 'BOOKED' WHERE "tenantId" = ${tenantId} AND "unitId" = ${unitId} AND "id" = ANY(${hidden}::text[]) AND "kind" = 'WALKIN'`;
  try {
    await runLineTick(now, { tenantIds: [tenantId] });
  } finally {
    if (hidden.length) await prisma.$executeRaw`UPDATE "Appointment" SET "kind" = 'WALKIN' WHERE "tenantId" = ${tenantId} AND "unitId" = ${unitId} AND "id" = ANY(${hidden}::text[]) AND "kind" = 'BOOKED'`;
  }
}

async function ensureHr(): Promise<void> {
  const sys = await prisma.appSystem.findUnique({ where: { id: hr.systemId }, select: { tenantId: true } });
  if (!sys) {
    await prisma.appSystem.create({ data: { id: hr.systemId, tenantId, type: "HR", name: "ทีมงานบาร์เบอร์ (ฉาก B.5)" } });
    sum.created++;
  } else if (sys.tenantId !== tenantId) throw new Error(`AppSystem ${hr.systemId} เป็นของร้านอื่น — หยุด`);
  const emp = await prisma.hrEmployee.findUnique({ where: { id: hr.employeeId }, select: { tenantId: true, linkedUserId: true, systemId: true } });
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

/** ค่าคอมฯ ร้าน (ชั้น UNIT · ตามการ์ด 08) + ค่าคอมฯ ให้ผู้ให้บริการ */
async function ensureCommission(): Promise<void> {
  const rate = BSS.barber.unitDiffs.find((d) => d.key === "booking.money.commissionRate")!;
  const want = [
    { key: "booking.money.commissionRate", value: rate.value as unknown },
    { key: "booking.money.commissionTo", value: "PERFORMER" as unknown },
  ];
  const cur = await resolveSettings({ tenantId }, want.map((w) => w.key), { unitId });
  const changes = want.filter((w) => !same(cur[w.key]?.value, w.value)).map((w) => ({ key: w.key, scope: "UNIT", scopeId: unitId, value: w.value }));
  if (!changes.length) return;
  const r = await setSettings(OWNER, { tenantId }, changes);
  if (!r.ok) throw new Error(`ค่าคอมฯ ร้าน: ${r.code} ${JSON.stringify((r as { issues?: unknown }).issues ?? null).slice(0, 200)}`);
  sum.updated += changes.length;
}

/** ของที่ทำเพิ่มของฉาก (id ตายตัว): บริการ "ทรีตเมนต์บำรุงสี" (หน่วยบาร์เบอร์) + สินค้า "แว็กซ์จัดแต่งทรง" (ระบบ POS ของ svcqc) */
async function ensureExtras(): Promise<void> {
  const t = DPS.extras.treatment;
  const svc = await prisma.bookingService.findUnique({ where: { id: t.id }, select: { tenantId: true, unitId: true, name: true, priceSatang: true, durationMin: true, active: true } });
  if (!svc) {
    await prisma.bookingService.create({ data: { id: t.id, tenantId, unitId, name: t.name, durationMin: t.durationMin, priceSatang: t.priceSatang, depositSatang: 0, bufferMin: 0, bookable: false, active: true, sortOrder: 90 } });
    sum.created++;
  } else if (svc.tenantId !== tenantId || svc.unitId !== unitId) throw new Error(`BookingService ${t.id} เป็นของร้าน/สาขาอื่น — หยุด`);
  else if (svc.name !== t.name || svc.priceSatang !== t.priceSatang || svc.durationMin !== t.durationMin || !svc.active) {
    await prisma.bookingService.update({ where: { id: t.id }, data: { name: t.name, priceSatang: t.priceSatang, durationMin: t.durationMin, active: true } });
    sum.updated++;
  }
  const w = DPS.extras.wax;
  const p = await prisma.posProduct.findUnique({ where: { id: w.id }, select: { tenantId: true, systemId: true, name: true, basePriceSatang: true, archivedAt: true } });
  if (!p) {
    await prisma.posProduct.create({ data: { id: w.id, tenantId, systemId: posSystemId, unitId: null, kind: "PRODUCT", name: w.name, basePriceSatang: w.priceSatang, trackStock: false, images: [] } });
    sum.created++;
  } else if (p.tenantId !== tenantId || p.systemId !== posSystemId) throw new Error(`PosProduct ${w.id} เป็นของร้าน/ระบบอื่น — หยุด`);
  else if (p.name !== w.name || p.basePriceSatang !== w.priceSatang || p.archivedAt !== null) {
    await prisma.posProduct.update({ where: { id: w.id }, data: { name: w.name, basePriceSatang: w.priceSatang, archivedAt: null } });
    sum.updated++;
  }
}

async function serviceIds(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const s of SQC.barber.services) {
    const items = await prisma.invItem.findMany({ where: { tenantId, sku: s.sku }, select: { id: true } });
    const proj = items.length ? await prisma.bookingService.findFirst({ where: { tenantId, unitId, itemId: { in: items.map((i) => i.id) } }, select: { id: true } }) : null;
    const byName = proj ?? (await prisma.bookingService.findFirst({ where: { tenantId, unitId, name: s.name }, select: { id: true } }));
    if (!byName) throw new Error(`ไม่พบบริการ ${s.sku} ${s.name} ของหน่วยบาร์เบอร์ — รัน seed ก่อน`);
    out[s.sku] = byName.id;
  }
  return out;
}

/** ลบงานของวันฉาก + บิลพักของงานเหล่านั้น + บัตร + ลำดับเลขบัตรของวัน (บิลขายที่จ่ายแล้วไม่ลบ) */
async function wipeDay(ds: string): Promise<number> {
  const appts = await prisma.appointment.findMany({ where: { tenantId, unitId, OR: [{ startAt: dayRange(ds) }, { idempotencyKey: { startsWith: keyOf(ds, "") } }] }, select: { id: true } });
  const ids = appts.map((a) => a.id);
  if (ids.length) sum.removed += (await prisma.posHeldCart.deleteMany({ where: { tenantId, serviceJobId: { in: ids } } })).count;
  await prisma.queueTicket.deleteMany({ where: { tenantId, unitId, refType: "APPOINTMENT", OR: [{ businessDate: ds }, ...(ids.length ? [{ refId: { in: ids } }] : [])] } });
  const sysTypes = await prisma.queueType.findMany({ where: { tenantId, unitId, isSystem: true }, select: { id: true } });
  if (sysTypes.length) await prisma.queueDailySequence.deleteMany({ where: { tenantId, unitId, businessDate: ds, typeId: { in: sysTypes.map((t) => t.id) } } });
  if (ids.length) await prisma.appointment.deleteMany({ where: { tenantId, unitId, id: { in: ids } } });
  return ids.length;
}

async function sceneDays(): Promise<string[]> {
  const rows = await prisma.appointment.findMany({ where: { tenantId, unitId, idempotencyKey: { startsWith: KEY_PREFIX } }, select: { idempotencyKey: true } });
  return [...new Set(rows.map((r) => (r.idempotencyKey ?? "").slice(KEY_PREFIX.length, KEY_PREFIX.length + 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
}

/** วันนั้นครบไหม: นัดครบ · P004 (X = DONE + บิล HELD · Y = IN_SERVICE) · บิล HELD ของวัน X = P004 + A008 เท่านั้น */
async function dayComplete(ds: string, finished: boolean): Promise<boolean> {
  const have = await prisma.appointment.count({ where: { tenantId, unitId, idempotencyKey: { in: SCENE.bookings.map((b) => keyOf(ds, b.key)) } } });
  if (have !== SCENE.bookings.length) return false;
  const p = await prisma.appointment.findFirst({ where: { tenantId, unitId, idempotencyKey: keyOf(ds, P004) }, select: { id: true, status: true, depositPaidAt: true } });
  if (!p || !p.depositPaidAt) return false;
  if (!finished) return p.status === "IN_SERVICE" && (await dayHasNoHeld(ds));
  if (p.status !== "DONE") return false;
  const dayIds = (await prisma.appointment.findMany({ where: { tenantId, unitId, startAt: dayRange(ds) }, select: { id: true } })).map((a) => a.id);
  const held = await prisma.posHeldCart.count({ where: { tenantId, unitId, status: "HELD", serviceJobId: { in: dayIds } } });
  return held === DPS.expect.queue.length;
}
/** วัน Y: ไม่มีบิล HELD ค้าง (แผงหน้าขายของวัน X เห็นเฉพาะ P004 + A008) */
async function dayHasNoHeld(ds: string): Promise<boolean> {
  const dayIds = (await prisma.appointment.findMany({ where: { tenantId, unitId, startAt: dayRange(ds) }, select: { id: true } })).map((a) => a.id);
  return (await prisma.posHeldCart.count({ where: { tenantId, unitId, status: "HELD", serviceJobId: { in: dayIds } } })) === 0;
}

async function buildDay(ds: string, finishP004: boolean): Promise<void> {
  const svc = await serviceIds();
  const fx: Record<string, string> = {};
  for (const b of SCENE.bookings) {
    const r = await bookAppointment(ctx, {
      serviceId: svc[b.sku], staffId: b.staff ? SCENE.staffIds[b.staff] : null, dateStr: ds, startMin: hm(b.start), channel: "STAFF",
      customerName: b.name, customerPhone: b.phone, idempotencyKey: keyOf(ds, b.key),
    });
    if (!r.ok) throw new Error(`จอง ${b.key} ${b.start} ล้ม ${r.code} ${r.reason}`);
    fx[b.key] = r.id;
    sum.created++;
    if (r.status === "PENDING") {
      const c = await setAppointmentStatus(tenantId, unitId, r.id, "CONFIRMED");
      if (!c.ok) throw new Error(`ยืนยัน ${b.key}: ${c.reason}`);
    }
  }
  // P004 รับมัดจำ ฿200 ทาง PromptPay ก่อนเช็กอิน (ใบรับ POS_DEPOSIT)
  const dep = await recordDeposit(ctx, fx[P004], "PROMPTPAY");
  if (!dep.ok) throw new Error(`มัดจำ P004: ${dep.reason}`);
  const events: SqcLineEvent[] = [
    ...SCENE.events,
    ...DPS.extraEvents.filter((e) => finishP004 || !("key" in e && e.key === P004)),
  ];
  for (const ev of events) {
    const now = at(ds, ev.at);
    const where = `${ds} ${ev.at} ${ev.op}${"key" in ev ? ` ${ev.key}` : ""}`;
    if (ev.op === "tick") {
      await tickSceneDay(now, ds);
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
    if (ev.op === "done") {
      const extras = ev.key === P004 ? [{ kind: "SERVICE" as const, serviceId: DPS.extras.treatment.id, staffId: ekStaffId }, { kind: "PRODUCT" as const, productId: DPS.extras.wax.id, qty: 1, staffId: ekStaffId }] : [];
      const r = await finishJob({ ...ctx, actorUserId: hrUser.userId }, id, { extras, now });
      if (!r.ok) throw new Error(`${where}: ${r.code} ${r.reason}`);
      // บิลจากคิวอื่นของวันจ่ายแล้ว — วัน X เหลือ P004 + A008 รอที่เคาน์เตอร์ (ภาพ ข) · วัน Y จ่ายหมด (แผงหน้าขายแสดงบิล HELD ทุกวันของสาขา)
      if (r.heldCartId && ev.key !== P004 && (ev.key !== A008 || !finishP004)) {
        const v = await serviceBills.serviceBillView({ tenantId, systemId: posSystemId, unitId }, CASHIER, { heldCartId: r.heldCartId });
        if (!v.ok) throw new Error(`${where}: เปิดบิลจากคิวไม่ได้ ${v.code}`);
        const p = await serviceBills.payServiceBill({ tenantId, systemId: posSystemId, unitId }, CASHIER, {
          heldCartId: r.heldCartId, payMethods: [{ type: "CASH", amountSatang: v.dueSatang }], idempotencyKey: keyOf(ds, `pay-${ev.key}`),
        });
        if (!p.ok) throw new Error(`${where}: รับเงินบิลจากคิวไม่ได้ ${p.code} ${"message" in p ? p.message : ""}`);
      }
      continue;
    }
    const r = ev.op === "checkIn" ? await checkIn(ctx, { appointmentId: id }, { via: "STAFF", now })
      : ev.op === "start" ? await startJob(ctx, id, { now })
      : await cancelByShop(ctx, id, { now });
    if (!r.ok) throw new Error(`${where}: ${r.code} ${r.reason}`);
  }
  await runPlanner(ctx, { now: at(ds, finishP004 ? DPS.registerAt : DPS.at) });
}

let exitCode = 0;
try {
  const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "BOOKING" }, select: { id: true } });
  const link = await prisma.appSystemUnit.findFirst({ where: { tenantId, unitId, type: "POS", systemId: posSystemId }, select: { id: true } });
  if (!unit || !link) {
    console.error(`🔴 ${LABEL}: หน่วยบาร์เบอร์ svcqc ไม่พร้อม (ต้องผูก POS ${posSystemId}) — รัน scripts/seed-svc-qc.mts ก่อน`);
    process.exit(3);
  }
  const plan: [string, boolean][] = [[DAYS.x, true], [DAYS.y, false]];
  if (clear) {
    for (const ds of new Set([...(await sceneDays()), DAYS.x, DAYS.y])) sum.removed += await wipeDay(ds);
    console.log(`${LABEL}: --clear ลบงานฉาก (วัน ${DAYS.x} · ${DAYS.y} + วันฉากเดิม) และบิลพักของงานเหล่านั้น`);
  } else {
    const tpl = await applyTemplate(OWNER, { tenantId }, { unitId, domain: "booking", templateKey: "BARBER", overwrite: "KEEP_CUSTOM" });
    if (!tpl.ok) throw new Error(`applyTemplate BARBER: ${tpl.code} ${JSON.stringify(tpl.issues ?? null).slice(0, 200)}`);
    await ensureHr();
    await ensureCommission();
    await ensureExtras();
    const stale = (await sceneDays()).filter((d) => d !== DAYS.x && d !== DAYS.y);
    for (const ds of stale) sum.removed += await wipeDay(ds);
    for (const [ds, fin] of plan) {
      if (await dayComplete(ds, fin)) {
        console.log(`${LABEL}: วัน ${ds} ครบแล้ว — ไม่สร้างใหม่`);
        continue;
      }
      sum.removed += await wipeDay(ds);
      await buildDay(ds, fin);
      console.log(`${LABEL}: สร้างวัน ${ds} (${fin ? `P004 ส่งเคาน์เตอร์แล้ว · ภาพ ข ?at= ${at(ds, DPS.registerAt).toISOString()}` : `P004 กำลังทำ · ภาพ ก ?at= ${at(ds, DPS.at).toISOString()}`})`);
    }
  }
} catch (e) {
  exitCode = 1;
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);
