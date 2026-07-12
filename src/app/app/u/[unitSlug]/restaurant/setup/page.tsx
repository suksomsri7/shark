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
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { DataList } from "@/components/ui/DataList";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { TABLE_STATUS_LABEL } from "@/lib/ui/status-labels";

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
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="ตั้งค่าร้านอาหาร"
        desc={unit.name}
        back={{ href: `/app/u/${unitSlug}/restaurant`, label: "หน้างาน" }}
      />

      {/* บิล & ครัว */}
      <Section title="บิล & ครัว" card>
        <form action={updateSettingAction.bind(null, unitSlug)} className="flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>ค่าบริการ (%)</span>
            <input
              name="serviceChargePct"
              type="number"
              step="0.5"
              min="0"
              defaultValue={setting.serviceChargeBps / 100}
              className="w-24 rounded-lg border px-2 py-2 text-right"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>ปิดรับออเดอร์ก่อนปิดร้าน (นาที)</span>
            <input name="lastOrderMins" type="number" min="0" defaultValue={setting.lastOrderMins} className="w-24 rounded-lg border px-2 py-2 text-right" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="requireApproval" type="checkbox" defaultChecked={setting.requireApproval} />
            <span>ออเดอร์ QR ต้องให้พนักงานกดรับก่อนเข้าครัว</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>เตือนใกล้เกินเวลา (นาที)</span>
              <input name="kdsWarnMins" type="number" min="1" defaultValue={setting.kdsWarnMins} className="w-16 rounded-lg border px-2 py-2 text-right" />
            </label>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>เตือนเกินเวลา (นาที)</span>
              <input name="kdsCriticalMins" type="number" min="1" defaultValue={setting.kdsCriticalMins} className="w-16 rounded-lg border px-2 py-2 text-right" />
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
      </Section>

      {/* KDS stations */}
      <Section title="สถานีครัว (KDS)">
        <div className="flex flex-wrap gap-2">
          {stations.map((s) => (
            <span key={s.id} className="rounded-full border px-3 py-1 text-sm">
              {s.name}
            </span>
          ))}
        </div>
        <form action={createStationAction.bind(null, unitSlug)} className="flex gap-2">
          <input name="name" placeholder="ชื่อสถานีใหม่ เช่น ของหวาน" className="input flex-1" />
          <button className="btn btn-ghost text-sm">เพิ่มสถานี</button>
        </form>
      </Section>

      {/* Zones */}
      <Section title="โซน">
        <DataList
          items={zones.map((z) => ({
            key: z.id,
            primary: z.name,
            trailing: (
              <ConfirmDialog
                triggerLabel="ลบ"
                triggerClassName="btn-sm text-[color:var(--color-danger)]"
                title={`ลบโซน "${z.name}"?`}
                confirmLabel="ลบโซน"
                danger
                action={archiveZoneAction.bind(null, unitSlug)}
                fields={{ id: z.id }}
              />
            ),
          }))}
          empty="ยังไม่มีโซน — เพิ่มโซนก่อนสร้างโต๊ะ"
        />
        <form action={createZoneAction.bind(null, unitSlug)} className="flex gap-2">
          <input name="name" placeholder="ชื่อโซน เช่น ในร้าน / ระเบียง" className="input flex-1" />
          <button className="btn btn-ghost text-sm">เพิ่มโซน</button>
        </form>
      </Section>

      {/* Tables + QR */}
      <Section title="โต๊ะ & QR สั่งอาหาร">
        {tables.length === 0 ? (
          <EmptyState text="ยังไม่มีโต๊ะ — เพิ่มโต๊ะด้านล่างเพื่อสร้าง QR สั่งอาหาร" />
        ) : (
          <div className="flex flex-col gap-2">
            {tables.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-[color:var(--color-muted)]">
                    {t.zoneName} · {t.seats} ที่
                  </span>
                  <StatusChip
                    value={t.status}
                    map={TABLE_STATUS_LABEL}
                    toneOf={(v) => (v === "ACTIVE" ? "strong" : "muted")}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a href={`${storeBase}/t/${t.qrToken}`} target="_blank" rel="noreferrer" className="btn-sm">
                    ลิงก์ QR
                  </a>
                  <form action={rotateQrAction.bind(null, unitSlug)}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="btn-sm">เปลี่ยน QR</button>
                  </form>
                  <form action={setTableStatusAction.bind(null, unitSlug)}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="status" value={t.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
                    <button className="btn-sm">
                      {t.status === "ACTIVE" ? "ปิดโต๊ะ" : "เปิดโต๊ะ"}
                    </button>
                  </form>
                  <ConfirmDialog
                    triggerLabel="ลบ"
                    triggerClassName="btn-sm text-[color:var(--color-danger)]"
                    title={`ลบโต๊ะ "${t.name}"?`}
                    confirmLabel="ลบโต๊ะ"
                    danger
                    action={archiveTableAction.bind(null, unitSlug)}
                    fields={{ id: t.id }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {zones.length > 0 && (
          <form action={createTableAction.bind(null, unitSlug)} className="flex flex-wrap gap-2">
            <select name="zoneId" className="rounded-lg border px-2 py-2 text-sm">
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
            <input name="name" placeholder="ชื่อโต๊ะ เช่น A1" className="w-32 rounded-lg border px-3 py-2 text-sm" />
            <input name="seats" type="number" min="1" defaultValue={4} className="w-20 rounded-lg border px-3 py-2 text-sm" />
            <button className="btn btn-ghost text-sm">เพิ่มโต๊ะ</button>
          </form>
        )}
      </Section>

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
