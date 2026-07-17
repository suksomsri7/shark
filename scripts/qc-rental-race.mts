// QC — Rental: กันจองซ้อน asset ระดับ DB (race-safe row-lock) · Fable oracle (Builder ห้ามแตะ)
// สัญญา src/lib/modules/rental/service.ts createBooking (ctx {tenantId, unitId} — unit type RENTAL):
//   - ล็อกแถว "RentalAsset" FOR UPDATE ต้นของ $transaction → 2 request เช่า asset เดียวกัน
//     ช่วงทับกันพร้อมกัน serialize → สำเร็จ 1 ล้มเหลว 1 (จองซ้อนไม่เกิด)
//   - overlap ปกติ (sequential) → throw ไทย (booking ไม่เกิด)
//   - คนละ asset ช่วงเดียวกัน → ได้ทั้งคู่ (lock ต่อ asset ไม่ล็อกเกิน)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const D = (s: string) => new Date(s);

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`);
};

let tid = "";
try {
  const rt = (await import("@/lib/modules/rental/service" as string)) as {
    [k: string]: (...a: any[]) => Promise<any>;
  };
  const t = await prisma.tenant.create({ data: { name: "QC RENT RACE", slug: `qc-rent-race-${Date.now()}` } });
  tid = t.id;
  const unit = await prisma.businessUnit.create({
    data: { tenantId: tid, type: "RENTAL", name: "เช่า QC", slug: `rentr-${Date.now()}` },
  });
  const ctx = { tenantId: tid, unitId: unit.id };

  const a1 = await rt.createAsset(ctx, { name: "รถ A", dailyRateSatang: 30000, depositSatang: 0 });
  const a2 = await rt.createAsset(ctx, { name: "รถ B", dailyRateSatang: 30000, depositSatang: 0 });

  const mk = (assetId: string, from: string, to: string) =>
    rt.createBooking(ctx, {
      assetId,
      customerName: "ลูกค้า",
      customerPhone: "0800000000",
      startDate: D(from),
      endDate: D(to),
    });

  // ── R-1: RACE — 2 request จอง asset เดียวกัน ช่วงทับกัน พร้อมกัน → สำเร็จ 1 ล้มเหลว 1 ──
  const [r1, r2] = await Promise.allSettled([
    mk(a1.id, "2027-01-01", "2027-01-05"),
    mk(a1.id, "2027-01-03", "2027-01-07"), // ทับ 3-5
  ]);
  const okCount = [r1, r2].filter((r) => r.status === "fulfilled").length;
  const failCount = [r1, r2].filter((r) => r.status === "rejected").length;
  chk("R-1.1", `race asset เดียวช่วงทับ → สำเร็จ 1 ล้มเหลว 1 (ok=${okCount} fail=${failCount})`, okCount === 1 && failCount === 1);
  const dbCount1 = await prisma.rentalBooking.count({
    where: { tenantId: tid, assetId: a1.id, status: { in: ["BOOKED", "PICKED_UP"] } },
  });
  chk("R-1.2", `หลัง race มี booking active จริงใน DB แค่ 1 (ไม่จองซ้อน) — พบ ${dbCount1}`, dbCount1 === 1);

  // ── R-2: overlap sequential — จองทับช่วงเดิม → throw (booking ไม่เกิด) ──
  let seqThrew = false;
  try {
    await mk(a1.id, "2027-01-02", "2027-01-06");
  } catch {
    seqThrew = true;
  }
  chk("R-2.1", "จองทับช่วงเดิม (sequential) → throw ไทย", seqThrew);
  const dbCount2 = await prisma.rentalBooking.count({
    where: { tenantId: tid, assetId: a1.id, status: { in: ["BOOKED", "PICKED_UP"] } },
  });
  chk("R-2.2", `sequential overlap ไม่เพิ่ม booking (ยังคง 1) — พบ ${dbCount2}`, dbCount2 === 1);

  // ── R-3: คนละ asset ช่วงเดียวกัน → ได้ทั้งคู่ (lock ต่อ asset ไม่ล็อกเกิน) ──
  const [b1, b2] = await Promise.allSettled([
    mk(a1.id, "2028-02-01", "2028-02-03"),
    mk(a2.id, "2028-02-01", "2028-02-03"),
  ]);
  chk("R-3.1", "คนละ asset ช่วงเดียวกัน → ได้ทั้งคู่", b1.status === "fulfilled" && b2.status === "fulfilled");

  // ── R-4: ช่วงติดกันแบบไม่ทับ (endDate exclusive) → ได้ทั้งคู่ ──
  const back2back = await mk(a1.id, "2027-01-05", "2027-01-08").then(() => true).catch(() => false);
  chk("R-4.1", "ช่วงต่อท้ายแบบไม่ทับ (endDate exclusive) → จองได้", back2back);
} catch (e) {
  chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 200) : String(e)), false);
} finally {
  const d = async (f: () => Promise<unknown>) => {
    try { await f(); } catch {}
  };
  if (tid) {
    await d(() => prisma.rentalBooking.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.rentalAsset.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Rental Race =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
