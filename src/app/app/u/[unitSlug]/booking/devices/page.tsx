// SVC B.6 — จอทีวี · ตู้รับบัตร ของสาขา (จัดการอุปกรณ์ + ค่าตั้งรายเครื่องชั้น DEVICE) · ต้องมี booking.devices.manage
// กติกาเหล็ก #16: ช่องค่าตั้งรายเครื่องมาจาก loadSettingsForm (scope DEVICE) + SettingsForm เท่านั้น · ผู้กระทำจาก session (auth.active)
import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { loadSettingsForm } from "@/lib/core/settings";
import { resetSettingAction, saveSettingsAction } from "@/lib/core/settings/actions";
import { createDeviceAction, revokeDeviceAction, rotateDeviceTokenAction } from "@/lib/actions/booking-devices";
import { isSingleLineUnit, listDevices } from "@/lib/modules/booking/devices";
import DevicesPanel from "@/components/booking/DevicesPanel";
import SettingsForm from "@/components/settings/SettingsForm";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function BookingDevicesPage({ params }: { params: Promise<{ unitSlug: string }> }) {
  const { unitSlug } = await params;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "BOOKING") notFound();
  const actor = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
    userId: auth.active.userId,
  };
  if (!evaluate(actor, { module: "booking", action: "booking.devices.manage", unitId: unit.id })) notFound();
  const ctx = { tenantId: auth.active.tenantId, unitId: unit.id };
  const header = <PageHeader title="จอทีวี · ตู้รับบัตร" desc="เพิ่มเครื่องแล้วเปิดลิงก์บนจอ/แท็บเล็ตหน้าร้าน — ลิงก์แสดงครั้งเดียว ถ้าหายให้กดเปลี่ยนลิงก์" />;
  if (!(await isSingleLineUnit(ctx))) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        {header}
        <p className="rounded-xl border border-[color:var(--color-line)] px-4 py-3 text-sm">เปิดโหมดคิวแถวเดียวก่อน (ตั้งค่าการจองและคิว) จึงเพิ่มจอทีวีหรือตู้รับบัตรได้</p>
      </div>
    );
  }
  const devices = await listDevices(ctx);
  const forms = await Promise.all(
    devices.map((d) =>
      loadSettingsForm(actor, { tenantId: auth.active.tenantId }, { domains: ["booking"], groups: d.kind === "TV" ? ["display"] : ["kiosk", "queue"], unitId: unit.id, scope: "DEVICE", scopeId: d.id }),
    ),
  );
  const settings = Object.fromEntries(
    devices.map((d, i) => {
      const m = forms[i];
      return [
        d.id,
        <div key={d.id} data-bq-device-settings={d.id}>
          {m ? <SettingsForm model={m} actions={{ save: saveSettingsAction, reset: resetSettingAction }} /> : <p className="text-sm text-[color:var(--color-muted)]">ไม่มีค่าตั้งที่แก้ได้</p>}
        </div>,
      ];
    }),
  );
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {header}
      <DevicesPanel
        unitSlug={unitSlug}
        devices={devices}
        actions={{ create: createDeviceAction.bind(null, unitSlug), rotate: rotateDeviceTokenAction.bind(null, unitSlug), revoke: revokeDeviceAction.bind(null, unitSlug) }}
        settings={settings}
      />
    </div>
  );
}
