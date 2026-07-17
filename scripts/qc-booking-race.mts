// QC — ระบบจอง: กันจองซ้อนระดับ DB (race-safe row-lock) + idempotency · Fable oracle
// สัญญา src/lib/modules/booking/service.ts createAppointment:
//   - ล็อกแถว "BookingStaff" FOR UPDATE ต้นของ $transaction → 2 request จองช่างคนเดียว
//     พร้อมกัน serialize → สำเร็จ 1 ล้มเหลว 1 (จองซ้อนไม่เกิด)
//   - idempotencyKey?: string → key เดิม = คืนนัดเดิม (ไม่สร้างใหม่); ชน unique = คืนนัดเดิม
//   - overlap ปกติ (sequential) → ok:false
//   - คนละช่าง เวลาเดียวกัน → ได้ทั้งคู่ (lock ต่อช่าง ไม่ล็อกเกิน)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const svc = (await import("@/lib/modules/booking/service" as string)) as any;
const { localToUtc } = (await import("@/lib/modules/booking/slots" as string)) as any;

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`);
};

let tid = "";
const DATE = "2031-03-15"; // อนาคตไกล (กัน filter อดีต)
const SLOT = 600; // 10:00

try {
  const t = await prisma.tenant.create({ data: { name: "QC Booking Race", slug: `qc-bkr-${Date.now()}` } });
  tid = t.id;
  const unit = await prisma.businessUnit.create({
    data: { tenantId: tid, type: "BOOKING", name: "สาขาเทส", slug: `u-${Date.now()}` },
  });
  const service = await prisma.bookingService.create({
    data: { tenantId: tid, unitId: unit.id, name: "ตัดผม", durationMin: 60, bufferMin: 0, priceSatang: 0 },
  });
  const staffA = await prisma.bookingStaff.create({ data: { tenantId: tid, unitId: unit.id, name: "ช่างเอ" } });
  const staffB = await prisma.bookingStaff.create({ data: { tenantId: tid, unitId: unit.id, name: "ช่างบี" } });

  const base = (over: Record<string, unknown> = {}) => ({
    tenantId: tid,
    unitId: unit.id,
    serviceId: service.id,
    staffId: staffA.id,
    dateStr: DATE,
    startMin: SLOT,
    customerName: "ลูกค้า",
    customerPhone: "0800000000",
    source: "ONLINE" as const,
    ...over,
  });

  const countActive = (staffId: string, startMin: number) =>
    prisma.appointment.count({
      where: {
        tenantId: tid,
        staffId,
        startAt: localToUtc(DATE, startMin),
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
      },
    });

  // ── R-1: RACE — 2 request จอง slot เดียวกัน ช่างเดียวกัน พร้อมกัน → สำเร็จ 1 ล้มเหลว 1 ──
  // ยิง 2 promise จริง ๆ (ไม่ await ทีละตัว) → ต้องชน row-lock บน "BookingStaff"
  const [r1, r2] = await Promise.all([
    svc.createAppointment(base()),
    svc.createAppointment(base()),
  ]);
  const okCount = [r1, r2].filter((r) => r.ok).length;
  const failCount = [r1, r2].filter((r) => !r.ok).length;
  chk("R-1.1", `race จอง slot เดียวกัน → สำเร็จ 1 ล้มเหลว 1 (ได้ ok=${okCount} fail=${failCount})`, okCount === 1 && failCount === 1);
  const dbCount1 = await countActive(staffA.id, SLOT);
  chk("R-1.2", `หลัง race มีนัดจริงใน DB แค่ 1 (ไม่จองซ้อน) — พบ ${dbCount1}`, dbCount1 === 1);

  // ── R-2: overlap sequential — จองทับเวลาช่างเดิม (คนละ startMin แต่ทับกัน) → ok:false ──
  const overlap = await svc.createAppointment(base({ startMin: SLOT + 30 })); // 10:30 ทับ 10:00-11:00
  chk("R-2.1", "จองทับเวลาช่างเดิม (sequential) → ok:false", overlap.ok === false);

  // ── R-3: คนละช่าง เวลาเดียวกัน → ได้ทั้งคู่ (lock ต่อช่าง ไม่ล็อกเกิน) ──
  const [b1, b2] = await Promise.all([
    svc.createAppointment(base({ staffId: staffB.id, startMin: 720 })), // ช่างบี 12:00
    svc.createAppointment(base({ staffId: staffA.id, startMin: 720 })), // ช่างเอ 12:00 (ว่างช่วงนี้)
  ]);
  chk("R-3.1", "คนละช่าง เวลาเดียวกัน → ได้ทั้งคู่", b1.ok === true && b2.ok === true);

  // ── I-1: idempotency — key เดิม 2 ครั้ง → 1 นัด (คืนตัวเดิม) ──
  const key = `qc-idem-${Date.now()}`;
  const i1 = await svc.createAppointment(base({ startMin: 840, idempotencyKey: key })); // 14:00
  const i2 = await svc.createAppointment(base({ startMin: 840, idempotencyKey: key }));
  chk("I-1.1", "key เดิม 2 ครั้ง → ok ทั้งคู่ + id เดียวกัน", i1.ok === true && i2.ok === true && i1.id === i2.id);
  const idemCount = await prisma.appointment.count({ where: { tenantId: tid, idempotencyKey: key } });
  chk("I-1.2", `key เดิม → มีนัดใน DB แค่ 1 (ไม่เบิ้ล) — พบ ${idemCount}`, idemCount === 1);

  // ── I-2: idempotency race — key เดิม ยิงพร้อมกัน → 1 นัด (P2002 → คืนตัวเดิม) ──
  const key2 = `qc-idem-race-${Date.now()}`;
  const [j1, j2] = await Promise.all([
    svc.createAppointment(base({ startMin: 960, idempotencyKey: key2 })), // 16:00
    svc.createAppointment(base({ startMin: 960, idempotencyKey: key2 })),
  ]);
  const jOk = [j1, j2].filter((r) => r.ok).length;
  const idemCount2 = await prisma.appointment.count({ where: { tenantId: tid, idempotencyKey: key2 } });
  chk(
    "I-2.1",
    `race key เดิม → ok ทั้งคู่ + id เดียวกัน + DB มี 1 (ok=${jOk} db=${idemCount2})`,
    jOk === 2 && j1.ok && j2.ok && (j1 as any).id === (j2 as any).id && idemCount2 === 1,
  );

  // ── I-3: ไม่ส่ง key (พฤติกรรมเดิม) — 2 slot ต่างกัน ได้ทั้งคู่ ──
  const n1 = await svc.createAppointment(base({ startMin: 1080 })); // 18:00 (ไม่มี key)
  const n2 = await svc.createAppointment(base({ startMin: 1140 })); // 19:00 (ไม่มี key)
  chk("I-3.1", "ไม่ส่ง key + คนละ slot → ได้ทั้งคู่ (idempotencyKey=null ไม่ชน unique)", n1.ok === true && n2.ok === true);
} catch (e) {
  chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 200) : String(e)), false);
} finally {
  if (tid) {
    const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
    await d(() => prisma.appointment.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.bookingStaff.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.bookingService.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Booking Race + Idempotency =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
