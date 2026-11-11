// qc-svc-smoke.mts — smoke ของ RUN SVC (ใบ R0.2 วางโครง · ใบหลังเติมข้อต่อท้าย คงข้อเดิม)
//
// รัน: bash scripts/iso.sh bash scripts/qc-svc.sh pnpm exec tsx scripts/qc-svc-smoke.mts
//      (ต้องมีร้านตัวอย่างก่อน — scripts/seed-svc-qc.mts)
//
// 🔴 อ่านอย่างเดียว — ห้ามเขียนฐาน (ข้อสอบเทียบลายนิ้วมือร้าน SVC ก่อน/หลัง) · ข้อที่ใบหลังต้องเขียน ⇒ คืนสภาพใน finally
// 🔴 ข้อมูลที่คาดอ่านจาก SQC (`scripts/svc-qc-data.mts`) ที่เดียว
// รูปแบบผล: ✅/❌/⏭️ ต่อข้อ + `JSON_SUMMARY {total,passed,failed[],skipped[]}` · exit 0 เมื่อไม่มี FAIL/SKIP
import { loadSvcQcEnv, SVC_QC_HOST_MARK } from "./svc-qc-env.mjs";
import { SQC } from "./svc-qc-data.mjs";

// ด่านฐาน: ไม่ใช่ qc-svc ⇒ exit 4 ก่อนแตะฐาน
const env = loadSvcQcEnv("qc-svc-smoke");

const { prisma, tenantDb } = await import("@/lib/core/db");
const booking = await import("@/lib/modules/booking/service");

type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "") => {
  cks.push({ id, res: ok ? "PASS" : "FAIL", why: detail });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const skip = (id: string, name: string, why: string) => {
  cks.push({ id, res: "SKIP", why });
  console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`);
};
void skip; // ใบหลังใช้
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
/** ข้อที่โยน error = FAIL (ไม่ให้ทั้งชุดล้ม) */
async function step(id: string, name: string, f: () => Promise<[boolean, string?]>) {
  try {
    const [ok, why] = await f();
    chk(id, name, ok, why ?? "");
  } catch (e) {
    chk(id, name, false, `error: ${errMsg(e)}`);
  }
}

const T = SQC.tenant.id;
const TB = SQC.other.tenant.id;
const U = SQC.units;

try {
  console.log("\n── R0.2: ร้านตัวอย่าง + ขอบเขต ──");

  await step("SM-ENV", "ด่าน env: ต่อฐาน qc-svc เท่านั้น", async () => [env.host.startsWith(SVC_QC_HOST_MARK), `host ${env.host}`]);

  await step("SM-UNITS", "ร้าน A มี 4 หน่วย ชนิดตามสัญญา (barber/massage BOOKING · dorm DORM · hotel HOTEL)", async () => {
    const rows = await prisma.businessUnit.findMany({ where: { tenantId: T }, select: { id: true, type: true, slug: true } });
    const bad = Object.values(U).filter((w) => {
      const r = rows.find((x) => x.id === w.id);
      return !r || r.type !== w.type || r.slug !== w.slug;
    });
    return [rows.length === 4 && bad.length === 0, `มี ${rows.length} หน่วย · ผิด: ${bad.map((b) => `${b.id}(${rows.find((x) => x.id === b.id)?.type ?? "ไม่มี"})`).join(", ") || "—"}`];
  });

  await step("SM-BOOKING", "โมดูลจองอ่านบาร์เบอร์ได้ช่าง 4 (เรียงเก้าอี้) · บริการ 6 ราคาตรงสัญญา (getBookingData)", async () => {
    const d = await booking.getBookingData(T, U.barber.id);
    const names = d.staff.map((s) => s.name);
    const wantNames = SQC.barber.staff.map((s) => s.name);
    const svcBad = SQC.barber.services.filter((w) => {
      const r = d.services.find((s) => s.name === w.name);
      return !r || r.priceSatang !== w.priceSatang || r.durationMin !== w.durationMin || r.depositSatang !== w.depositSatang;
    });
    return [
      JSON.stringify(names) === JSON.stringify(wantNames) && d.services.length === 6 && svcBad.length === 0,
      `ช่าง ${names.join(",")} · บริการ ${d.services.length} · ผิด ${svcBad.map((s) => s.name).join(",") || "—"}`,
    ];
  });

  await step("SM-MASSAGE", "โมดูลจองอ่านร้านนวดได้หมอนวด 6 · บริการ 6", async () => {
    const d = await booking.getBookingData(T, U.massage.id);
    return [d.staff.length === SQC.massage.staff.length && d.services.length === SQC.massage.services.length, `หมอ ${d.staff.length} · บริการ ${d.services.length}`];
  });

  await step("SM-ROOMS", "ห้องโรงแรม 14 (B205 รายเดือน) · หอ 36 (อ่านผ่าน tenantDb ของหน่วย)", async () => {
    const hotel = await tenantDb({ tenantId: T, unitId: U.hotel.id }).hotelRoom.findMany({ where: { active: true }, select: { number: true, rentMode: true } });
    const dorm = await tenantDb({ tenantId: T, unitId: U.dorm.id }).hotelRoom.count({ where: { active: true } });
    const b205 = hotel.find((r) => r.number === "B205")?.rentMode ?? null;
    return [hotel.length === SQC.hotel.rooms.length && dorm === SQC.dorm.rooms.length && b205 === "MONTHLY", `โรงแรม ${hotel.length} · หอ ${dorm} · B205=${b205}`];
  });

  await step("SM-X1", "ข้ามร้าน: tenantDb({ร้าน B, หน่วย barber ของร้าน A}) อ่านช่าง/บริการ/เวลา/ห้องได้ 0 แถว", async () => {
    const db = tenantDb({ tenantId: TB, unitId: U.barber.id });
    const dbHotel = tenantDb({ tenantId: TB, unitId: U.hotel.id });
    const n = {
      staff: (await db.bookingStaff.findMany({})).length,
      services: (await db.bookingService.findMany({})).length,
      hours: (await db.bookingHours.findMany({})).length,
      rooms: (await dbHotel.hotelRoom.findMany({})).length,
    };
    // positive control: ร้าน B อ่านหน่วยของตัวเองได้จริง (กันผล 0 เพราะคิวรีพัง)
    const own = (await tenantDb({ tenantId: TB, unitId: SQC.other.units.barber.id }).bookingStaff.findMany({})).length;
    return [n.staff + n.services + n.hours + n.rooms === 0 && own === 1, `ข้ามร้าน ${JSON.stringify(n)} · ร้าน B อ่านของตัวเอง ${own}`];
  });
} catch (e) {
  chk("CRASH", "จบกลางทาง: " + errMsg(e), false);
} finally {
  await prisma.$disconnect();
}

const failed = cks.filter((c) => c.res === "FAIL").map((c) => c.id);
const skipped = cks.filter((c) => c.res === "SKIP").map((c) => c.id);
const passed = cks.length - failed.length - skipped.length;
console.log(`\n===== QC SVC smoke =====\nผ่าน ${passed}/${cks.length}${skipped.length ? ` (SKIP ${skipped.length})` : ""}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed, failed, skipped })}`);
process.exit(failed.length + skipped.length > 0 ? 1 : 0);
