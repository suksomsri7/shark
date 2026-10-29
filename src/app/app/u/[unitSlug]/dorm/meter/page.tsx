import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { dormAccess, meterFlags, meterWalk } from "@/lib/modules/dorm";
import MeterWalk from "@/components/dorm/MeterWalk";
import { confirmMeterReadingAction, replaceMeterAction, submitMeterReadingsAction } from "./actions";

// จดมิเตอร์มือถือ (SVC D.6) — ภาพ ledger/design-dorm/03-meter-mobile.png · ข้อมูลผ่าน facade `@/lib/modules/dorm` (ไม่แตะ prisma)
//   หน่วยต้องเป็น DORM · ต้องมี dorm.meter.read (คนจดมิเตอร์เห็นแค่หน้านี้) · ไม่มีสิทธิ์/ไม่ใช่หอ ⇒ 404
//   ?period=YYYY-MM (ไม่ส่ง = เดือนนี้ไทย) · ?view=flags = รายการตรวจค่าผิดปกติ · ?floor=<key> · ?room=<roomId>
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function DormMeterPage({
  params,
  searchParams,
}: {
  params: Promise<{ unitSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") notFound();
  const membership = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (!dormAccess(membership, unit.id).meter) notFound();

  const asked = one(sp.period);
  const periodKey = asked && PERIOD_RE.test(asked) ? asked : bkkYmd(new Date()).slice(0, 7);
  const ctx = { tenantId: auth.active.tenantId };
  const [walk, flags] = await Promise.all([meterWalk(ctx, { unitId: unit.id, periodKey }), meterFlags(ctx, { unitId: unit.id, periodKey })]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <header className="mx-auto w-full max-w-md">
        <p className="text-xs text-[color:var(--color-muted)]">{unit.name}</p>
        <h1 className="text-2xl font-bold">{`จดมิเตอร์ ${periodKey}`}</h1>
      </header>
      <MeterWalk
        unitId={unit.id}
        periodKey={periodKey}
        walk={walk}
        flags={flags}
        submit={submitMeterReadingsAction.bind(null, unitSlug)}
        confirm={confirmMeterReadingAction.bind(null, unitSlug)}
        replace={replaceMeterAction.bind(null, unitSlug)}
        initialView={one(sp.view) === "flags" ? "flags" : "walk"}
        initialFloor={one(sp.floor)}
        initialRoomId={one(sp.room)}
      />
    </div>
  );
}
