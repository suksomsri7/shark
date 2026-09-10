// backfill 4/6 — ล็อตแต้มย้อนหลัง (D2 · พิมพ์เขียว §4.6 ข้อ 4 · §11.4)
//
// ทำอะไร (ต่อ "ระบบแต้ม" ของแต่ละร้าน)
//   1) หารายการ `PointLedger` ชนิด EARN ที่ยังไม่มีล็อต (`lotId` ว่าง) = แต้มยุคก่อน M2.1
//   2) จำลอง FIFO: ไล่รายการของลูกค้าคนนั้นตามเวลา · EARN = เปิดล็อตใหม่ · BURN/EXPIRE ยุคเก่า =
//      กินล็อตที่เปิดไว้ก่อนตามลำดับ ⇒ `remaining` ของแต่ละล็อต = แต้มที่ยัง "ค้าง" อยู่จริง
//   3) `expiresAt` = วันที่ได้แต้ม + `PointSettings.expiryMonths` ของร้าน
//      🔴 ล็อตที่คำนวณแล้ว "ควรหมดอายุไปแล้ว" **ไม่ตัดย้อนหลัง** — ตั้งเป็น วันรัน + 90 วัน
//         (มติในพิมพ์เขียว §4.6: ลูกค้าที่มีแต้มค้างอยู่ต้องไม่ตื่นมาเจอแต้มหายในวันดีพลอย
//          ให้เวลามาใช้ 3 เดือน + ระบบแจ้งเตือนล่วงหน้าตาม remindDays)
//   4) เขียน `PointLedger.lotId` กลับให้รายการ EARN นั้น ⇒ รันซ้ำจะไม่หยิบซ้ำ (idempotent)
//
// 🔴 ไม่แตะยอดคงเหลือ (`PointBalance`) เลย — backfill นี้ "อธิบาย" แต้มที่มีอยู่แล้ว ไม่ได้เพิ่ม/ลดแต้ม
// 🔴 รายการยุคใหม่ (BURN ที่มี `data.lots` · EXPIRE ที่มี `lotId`) ถูกข้ามในขั้นจำลอง
//    เพราะล็อตของมันถูกหักไปแล้วตอนทำรายการ — ถ้านับซ้ำจะได้ remaining ต่ำกว่าความจริง
//
// วิธีรัน
//   QC   :  pnpm exec tsx scripts/member-backfill-points-lots.mts [--tenant <slug>] [--dry-run]
//   PROD :  ALLOW_PROD_BACKFILL=1 pnpm exec tsx scripts/member-backfill-points-lots.mts --tenant <slug>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const SCRIPT = "member-backfill-points-lots";
const common = (await import("./member-backfill-common.mts" as string)) as Any;
const args = common.parseArgs();
await common.loadBackfillEnv(SCRIPT);

const { prisma } = await import("@/lib/core/db");
const tenants = await common.pickTenants(prisma, args.tenantSlug);
common.banner(SCRIPT, args, tenants);

const P = prisma as Any;
const DAY_MS = 24 * 60 * 60 * 1000;
/** ล็อตที่ "ควรหมดไปแล้ว" ได้เวลาผ่อนผันเท่านี้ นับจากวันที่รัน backfill (§4.6 ข้อ 4) */
const GRACE_DAYS = 90;
const runAt = new Date();

const counts = { ร้านที่แก้: 0, ล็อตที่สร้าง: 0, ล็อตผ่อนผัน: 0, รายการที่ผูกล็อต: 0, ลูกค้าที่แตะ: 0 };

const addMonths = (d: Date, n: number): Date => {
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() + n);
  return out;
};

/** รายการยุคใหม่ (หลัง M2.1) — ล็อตถูกหักไปแล้ว ไม่ต้องนับซ้ำในขั้นจำลอง */
const isV2Row = (row: Any): boolean => {
  if (row.lotId) return true;
  const data = row.data;
  return !!data && typeof data === "object" && Array.isArray((data as Any).lots);
};

for (const t of tenants) {
  const systems = (await P.appSystem.findMany({
    where: { tenantId: t.id, type: "POINT" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  })) as { id: string; name: string }[];
  if (systems.length === 0) continue;

  // อายุแต้มของร้าน — อ่านอย่างเดียว (dry-run ห้ามสร้างแถว settings ให้ใครโดยไม่ตั้งใจ)
  const settings = await P.pointSettings.findUnique({ where: { tenantId: t.id } });
  const expiryMonths: number = settings?.expiryMonths ?? 12;
  const expiryMode: string = settings?.expiryMode ?? "MONTHS";

  let touched = false;

  for (const sys of systems) {
    // ลูกค้าที่ยังมี EARN ไร้ล็อต
    const pending = (await P.pointLedger.findMany({
      where: { tenantId: t.id, systemId: sys.id, type: "EARN", lotId: null },
      select: { customerId: true },
      distinct: ["customerId"],
    })) as { customerId: string }[];
    if (pending.length === 0) continue;

    for (const { customerId } of pending) {
      const rows = (await P.pointLedger.findMany({
        where: { tenantId: t.id, systemId: sys.id, customerId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })) as Any[];

      // ── จำลอง FIFO บนรายการยุคเก่าเท่านั้น ──
      type Sim = { ledgerId: string; points: number; remaining: number; earnedAt: Date };
      const lots: Sim[] = [];
      for (const row of rows) {
        if (isV2Row(row)) continue;
        if (row.type === "EARN" && row.delta > 0) {
          lots.push({ ledgerId: row.id, points: row.delta, remaining: row.delta, earnedAt: row.createdAt });
          continue;
        }
        if ((row.type === "BURN" || row.type === "EXPIRE") && row.delta < 0) {
          let left = -row.delta;
          for (const lot of lots) {
            if (left <= 0) break;
            const take = Math.min(lot.remaining, left);
            lot.remaining -= take;
            left -= take;
          }
        }
      }
      if (lots.length === 0) continue;
      counts.ลูกค้าที่แตะ += 1;
      touched = true;

      for (const lot of lots) {
        const natural = expiryMode === "NEVER" ? null : addMonths(lot.earnedAt, expiryMonths);
        let expiresAt: Date | null = natural;
        let graced = false;
        if (natural && natural.getTime() <= runAt.getTime()) {
          expiresAt = new Date(runAt.getTime() + GRACE_DAYS * DAY_MS);
          graced = true;
        }
        counts.ล็อตที่สร้าง += 1;
        counts.รายการที่ผูกล็อต += 1;
        if (graced) counts.ล็อตผ่อนผัน += 1;
        if (args.dryRun) {
          console.log(
            `  [dry-run] ${t.slug}/${sys.name}: ล็อต ${lot.points} แต้ม (เหลือ ${lot.remaining}) ` +
              `ได้เมื่อ ${lot.earnedAt.toISOString().slice(0, 10)} → หมดอายุ ${expiresAt ? expiresAt.toISOString().slice(0, 10) : "ไม่หมดอายุ"}${graced ? " [ผ่อนผัน +90 วัน]" : ""}`,
          );
          continue;
        }
        await prisma.$transaction(async (tx: Any) => {
          // กันซ้อน: ระหว่างนี้อาจมีคนรัน backfill อีกรอบ/ระบบสร้างล็อตให้แล้ว
          const fresh = await tx.pointLedger.findUnique({ where: { id: lot.ledgerId } });
          if (!fresh || fresh.lotId) return;
          const created = await tx.pointLot.create({
            data: {
              tenantId: t.id,
              systemId: sys.id,
              customerId,
              ledgerId: lot.ledgerId,
              points: lot.points,
              remaining: lot.remaining,
              earnedAt: lot.earnedAt,
              expiresAt,
            },
          });
          await tx.pointLedger.update({ where: { id: lot.ledgerId }, data: { lotId: created.id, expiresAt } });
        });
      }
    }
  }

  if (touched) counts.ร้านที่แก้ += 1;
}

common.summary(SCRIPT, args, counts);
await prisma.$disconnect();
