// svc-qc-device-scene.mts — SVC B.6 · ฉากจอทีวี/ตู้/หน้าบัตร (ภาพ จอง 04 ก · 05 · 06 ก · 14:40) บนร้าน svcqc หน่วยบาร์เบอร์
//
// ใช้:
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-device-scene.mts            # สร้าง/ปรับฉาก ณ วันฉาก
//   bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/svc-qc-device-scene.mts --clear    # ลบงานฉาก + อุปกรณ์ฉาก + ค่าตั้ง DEVICE ของอุปกรณ์ฉาก
//
// ฉาก: SQC_TODAY_LINE_SCENE (bookings + events) ต่อด้วย SQC_DEVICE_SCENE.extraEvents · วันฉาก = sqcDeviceSceneDay (วันฉาก B.5 + 7 — ไม่ชนฉาก B.5)
//   1) แม่แบบ BARBER (KEEP_CUSTOM ในนามเจ้าของ svcqc) · ล้าง override booking.staff.minBreakMin ระดับหน่วย (เหมือนฉาก B.5 — ตัวเลขตรงภาพ)
//   2) นัด (idempotencyKey "svcqc-dev-<วันฉาก>-<key>") → events ตามเวลา (now ฉีด · tick ส่ง tenantIds:[svcqc] · op call = callJob) → runPlanner ณ 14:40
//   3) อุปกรณ์ 2 เครื่อง (id/ชื่อ/token ตายตัว · เก็บ "sha256:"+hex + settings {kind}) · ค่าตั้งชั้น DEVICE ของตู้ (setSettings เจ้าของ)
// idempotent: ครบแล้ว ⇒ SCENE_SUMMARY 0/0/0 · วันฉากเปลี่ยน/ไม่ครบ ⇒ ลบงาน+บัตร+ลำดับเลขบัตรของวันฉากเดิม/ใหม่ แล้วสร้างใหม่
// 🔴 รันผ่าน scripts/qc-svc.sh เท่านั้น (ด่าน host qc-svc ใน loadSvcQcEnv)
// บรรทัดท้าย: SCENE_SUMMARY {"created":n,"updated":n,"removed":n}
import { createHash } from "node:crypto";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";
import { SQC, SQC_TODAY_LINE_SCENE as SCENE, SQC_DEVICE_SCENE as DSC, sqcDeviceSceneDay, type SqcDeviceEvent } from "./svc-qc-data.mjs";

const LABEL = "svc-qc-device-scene";
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
const { bookAppointment, setAppointmentStatus } = await import("@/lib/modules/booking/service");
const { checkIn, createWalkIn, startJob, completeJob, cancelByShop, callJob } = await import("@/lib/modules/booking/queue-line");
const { runLineTick, runPlanner } = await import("@/lib/modules/booking/planner-run");

const tenantId = SQC.tenant.id;
const unitId = SQC.units.barber.id;
const ctx = { tenantId, unitId };
const D = sqcDeviceSceneDay(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10));
const KEY_PREFIX = DSC.idemPrefix;
const keyOf = (day: string, k: string) => `${KEY_PREFIX}${day}-${k}`;
const owner = SQC.users.find((u) => u.key === "owner")!;
const OWNER = { role: "OWNER" as const, unitAccess: ["*"], permissions: {}, userId: owner.userId };
const DEVICES = [DSC.devices.tv, DSC.devices.kiosk] as const;
const OVERRIDES: readonly { key: string; value: unknown }[] = DSC.devices.kiosk.overrides;

const hm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};
const at = (ds: string, s: string) => {
  const [y, mo, d] = ds.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d) + (hm(s) - 420) * 60_000);
};
const dayRange = (ds: string) => ({ gte: at(ds, "00:00"), lt: new Date(at(ds, "00:00").getTime() + 86_400_000) });
const stored = (token: string) => `sha256:${createHash("sha256").update(token).digest("hex")}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

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

async function clearUnitOverrides(): Promise<void> {
  sum.removed += (await prisma.settingValue.deleteMany({ where: { tenantId, key: "booking.staff.minBreakMin", scope: "UNIT", scopeId: unitId } })).count;
}

/** ลบงานของหน่วยบาร์เบอร์ในวันนั้น + นัดของฉาก + บัตร refType APPOINTMENT + ลำดับเลขบัตรของวัน */
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

async function sceneDays(): Promise<string[]> {
  const rows = await prisma.appointment.findMany({ where: { tenantId, unitId, idempotencyKey: { startsWith: KEY_PREFIX } }, select: { idempotencyKey: true } });
  return [...new Set(rows.map((r) => (r.idempotencyKey ?? "").slice(KEY_PREFIX.length, KEY_PREFIX.length + 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
}

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

async function buildDay(): Promise<void> {
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
  const events: SqcDeviceEvent[] = [...SCENE.events, ...DSC.extraEvents];
  for (const ev of events) {
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
      : ev.op === "call" ? await callJob(ctx, id, { now })
      : await cancelByShop(ctx, id, { now });
    if (!r.ok) throw new Error(`${where}: ${r.code} ${r.reason}`);
  }
  await runPlanner(ctx, { now: at(D, DSC.at) });
}

/** อุปกรณ์ฉาก (id/ชื่อ/token ตายตัว) — สร้าง/ปรับให้ตรง · คืนจำนวนที่เปลี่ยน */
async function ensureDevices(): Promise<void> {
  for (const d of DEVICES) {
    const row = await prisma.queueDisplay.findUnique({ where: { id: d.id }, select: { tenantId: true, unitId: true, name: true, displayToken: true, settings: true, revokedAt: true } });
    const want = { name: d.name, displayToken: stored(d.token), settings: { kind: d.kind }, revokedAt: null };
    if (!row) {
      await prisma.queueDisplay.create({ data: { id: d.id, tenantId, unitId, ...want } });
      sum.created++;
    } else if (row.tenantId !== tenantId || row.unitId !== unitId) {
      throw new Error(`QueueDisplay ${d.id} เป็นของร้าน/สาขาอื่น — หยุด`);
    } else if (row.name !== want.name || row.displayToken !== want.displayToken || !same(row.settings, want.settings) || row.revokedAt !== null) {
      await prisma.queueDisplay.update({ where: { id: d.id }, data: want });
      sum.updated++;
    }
  }
  const k = DSC.devices.kiosk;
  const cur = await resolveSettings({ tenantId }, OVERRIDES.map((o) => o.key), { unitId, deviceId: k.id });
  const changes = OVERRIDES.filter((o) => !(cur[o.key]?.source === "DEVICE" && same(cur[o.key]?.value, o.value))).map((o) => ({ key: o.key, scope: "DEVICE", scopeId: k.id, value: o.value }));
  if (changes.length) {
    const r = await setSettings(OWNER, { tenantId }, changes);
    if (!r.ok) throw new Error(`ค่าตั้ง DEVICE ของตู้ฉาก: ${r.code} ${JSON.stringify((r as { issues?: unknown }).issues ?? null).slice(0, 200)}`);
    sum.updated += changes.length;
  }
}

let exitCode = 0;
try {
  const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "BOOKING" }, select: { id: true } });
  const staffN = await prisma.bookingStaff.count({ where: { tenantId, unitId, active: true } });
  if (!unit || staffN !== 4) {
    console.error(`🔴 ${LABEL}: หน่วยบาร์เบอร์ svcqc ไม่พร้อม (ช่าง ${staffN} · ต้อง 4) — รัน scripts/seed-svc-qc.mts ก่อน`);
    process.exit(3);
  }
  const ids = DEVICES.map((d) => d.id);
  if (clear) {
    for (const ds of new Set([...(await sceneDays()), D])) sum.removed += await wipeDay(ds);
    sum.removed += (await prisma.settingValue.deleteMany({ where: { tenantId, scope: "DEVICE", scopeId: { in: ids } } })).count;
    sum.removed += (await prisma.queueDisplay.deleteMany({ where: { tenantId, id: { in: ids } } })).count;
    console.log(`${LABEL}: --clear ลบงานฉาก (วัน ${D} + วันฉากเดิม) · อุปกรณ์ฉาก · ค่าตั้ง DEVICE ของอุปกรณ์ฉาก`);
  } else {
    const tpl = await applyTemplate(OWNER, { tenantId }, { unitId, domain: "booking", templateKey: "BARBER", overwrite: "KEEP_CUSTOM" });
    if (!tpl.ok) throw new Error(`applyTemplate BARBER: ${tpl.code} ${JSON.stringify(tpl.issues ?? null).slice(0, 200)}`);
    await clearUnitOverrides();
    const have = await prisma.appointment.count({ where: { tenantId, unitId, idempotencyKey: { in: SCENE.bookings.map((b) => keyOf(D, b.key)) } } });
    const days = await sceneDays();
    // ผู้คุม 30 ต.ค.: + sceneIntact (เหมือนฉาก B.5)
    const complete = have === SCENE.bookings.length && days.length === 1 && days[0] === D
      && (await sceneIntact(D, [...SCENE.events, ...DSC.extraEvents].filter((e) => e.op === "walkIn").length));
    if (complete) {
      console.log(`${LABEL}: งานฉากวัน ${D} ครบแล้ว (นัด ${have}) — ไม่สร้างใหม่`);
    } else {
      for (const ds of new Set([...days, D])) sum.removed += await wipeDay(ds);
      await buildDay();
      console.log(`${LABEL}: สร้างฉากวัน ${D} ณ ${DSC.at} แล้ว (เปิดภาพด้วย ?at= ${at(D, DSC.at).toISOString()} · server ต้องตั้ง SVC_QC_CLOCK=1)`);
    }
    await ensureDevices();
  }
} catch (e) {
  exitCode = 1;
  console.error(`🔴 ${LABEL}: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await prisma.$disconnect();
}
console.log(`SCENE_SUMMARY ${JSON.stringify(sum)}`);
process.exit(exitCode);
