import Link from "next/link";
import { requireUnit } from "@/lib/core/context";
import { getSetting, listStations, ensureDefaultStations } from "@/lib/modules/restaurant/menu";
import { listZones } from "@/lib/modules/restaurant/table";
import { floorPlan } from "@/lib/modules/restaurant/table";
import {
  updateSettingAction,
  createStationAction,
  createZoneAction,
  archiveZoneAction,
  createTableAction,
  archiveTableAction,
  setTableStatusAction,
  rotateQrAction,
} from "@/lib/actions/restaurant";

export default async function RestaurantSetupPage({
  params,
}: {
  params: Promise<{ unitSlug: string }>;
}) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  const { tenantId } = auth.active;
  await ensureDefaultStations(tenantId, unit.id);
  const [setting, stations, zones, tables] = await Promise.all([
    getSetting(tenantId, unit.id),
    listStations(tenantId, unit.id),
    listZones(tenantId, unit.id),
    floorPlan(tenantId, unit.id),
  ]);

  const storeBase = `/s/${auth.active.tenant.slug}/${unit.slug}/restaurant`;

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-[color:var(--color-muted)]">{unit.name}</div>
          <h1 className="text-2xl font-semibold">ตั้งค่าร้านอาหาร</h1>
        </div>
        <Link href={`/app/u/${unitSlug}/restaurant`} className="btn btn-ghost text-sm">
          ← หน้างาน
        </Link>
      </div>

      {/* บิล & ครัว */}
      <section className="card flex flex-col gap-3">
        <h2 className="font-medium">บิล & ครัว</h2>
        <form action={updateSettingAction.bind(null, unitSlug)} className="flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Service charge (%)</span>
            <input
              name="serviceChargePct"
              type="number"
              step="0.5"
              min="0"
              defaultValue={setting.serviceChargeBps / 100}
              className="w-24 rounded-lg border px-2 py-1.5 text-right"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Last order ก่อนปิด (นาที)</span>
            <input name="lastOrderMins" type="number" min="0" defaultValue={setting.lastOrderMins} className="w-24 rounded-lg border px-2 py-1.5 text-right" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="requireApproval" type="checkbox" defaultChecked={setting.requireApproval} />
            <span>ออเดอร์ QR ต้องให้พนักงานกดรับก่อนเข้าครัว</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>KDS เหลือง (นาที)</span>
              <input name="kdsWarnMins" type="number" min="1" defaultValue={setting.kdsWarnMins} className="w-16 rounded-lg border px-2 py-1.5 text-right" />
            </label>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>KDS แดง (นาที)</span>
              <input name="kdsCriticalMins" type="number" min="1" defaultValue={setting.kdsCriticalMins} className="w-16 rounded-lg border px-2 py-1.5 text-right" />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-[color:var(--color-muted)]">
              เวลาเปิดครัว (JSON) — เว้นว่าง = เปิดตลอด · ตัวอย่าง: [{'{'}&quot;dow&quot;:1,&quot;ranges&quot;:[{'{'}&quot;open&quot;:&quot;10:00&quot;,&quot;close&quot;:&quot;21:00&quot;{'}'}]{'}'}]
            </span>
            <textarea
              name="serviceHours"
              rows={2}
              defaultValue={JSON.stringify(setting.serviceHours)}
              className="rounded-lg border px-2 py-1.5 font-mono text-xs"
            />
          </label>
          <button className="btn btn-primary self-start text-sm">บันทึกการตั้งค่า</button>
        </form>
      </section>

      {/* KDS stations */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">สถานีครัว (KDS)</h2>
        <div className="flex flex-wrap gap-2">
          {stations.map((s) => (
            <span key={s.id} className="rounded-full border px-3 py-1 text-sm">
              {s.name}
            </span>
          ))}
        </div>
        <form action={createStationAction.bind(null, unitSlug)} className="flex gap-2">
          <input name="name" placeholder="ชื่อสถานีใหม่ เช่น ของหวาน" className="flex-1 rounded-lg border px-2 py-1.5 text-sm" />
          <button className="btn btn-ghost text-sm">เพิ่มสถานี</button>
        </form>
      </section>

      {/* Zones */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">โซน</h2>
        <div className="flex flex-col gap-2">
          {zones.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีโซน — เพิ่มโซนก่อนสร้างโต๊ะ</p>
          ) : (
            zones.map((z) => (
              <div key={z.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span>{z.name}</span>
                <form action={archiveZoneAction.bind(null, unitSlug)}>
                  <input type="hidden" name="id" value={z.id} />
                  <button className="text-xs text-[color:var(--color-muted)] underline">ลบ</button>
                </form>
              </div>
            ))
          )}
        </div>
        <form action={createZoneAction.bind(null, unitSlug)} className="flex gap-2">
          <input name="name" placeholder="ชื่อโซน เช่น ในร้าน / ระเบียง" className="flex-1 rounded-lg border px-2 py-1.5 text-sm" />
          <button className="btn btn-ghost text-sm">เพิ่มโซน</button>
        </form>
      </section>

      {/* Tables + QR */}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">โต๊ะ & QR สั่งอาหาร</h2>
        {tables.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีโต๊ะ</p>
        ) : (
          <div className="flex flex-col gap-2">
            {tables.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{t.name}</span>{" "}
                  <span className="text-xs text-[color:var(--color-muted)]">
                    {t.zoneName} · {t.seats} ที่ · {t.status === "ACTIVE" ? "ใช้งาน" : "ปิด"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a href={`${storeBase}/t/${t.qrToken}`} target="_blank" rel="noreferrer" className="text-xs underline">
                    ลิงก์ QR
                  </a>
                  <form action={rotateQrAction.bind(null, unitSlug)}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-xs text-[color:var(--color-muted)] underline">เปลี่ยน QR</button>
                  </form>
                  <form action={setTableStatusAction.bind(null, unitSlug)}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="status" value={t.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
                    <button className="text-xs text-[color:var(--color-muted)] underline">
                      {t.status === "ACTIVE" ? "ปิดโต๊ะ" : "เปิดโต๊ะ"}
                    </button>
                  </form>
                  <form action={archiveTableAction.bind(null, unitSlug)}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-xs text-[color:var(--color-danger)] underline">ลบ</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
        {zones.length > 0 && (
          <form action={createTableAction.bind(null, unitSlug)} className="flex flex-wrap gap-2">
            <select name="zoneId" className="rounded-lg border px-2 py-1.5 text-sm">
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
            <input name="name" placeholder="ชื่อโต๊ะ เช่น A1" className="w-32 rounded-lg border px-2 py-1.5 text-sm" />
            <input name="seats" type="number" min="1" defaultValue={4} className="w-20 rounded-lg border px-2 py-1.5 text-sm" />
            <button className="btn btn-ghost text-sm">เพิ่มโต๊ะ</button>
          </form>
        )}
      </section>

      <div className="flex gap-3 text-sm">
        <Link href={`/app/u/${unitSlug}/restaurant/menu`} className="underline">
          จัดการเมนู →
        </Link>
        <Link href={`/app/u/${unitSlug}/restaurant/menu/options`} className="underline">
          กลุ่มตัวเลือก →
        </Link>
      </div>
    </div>
  );
}
