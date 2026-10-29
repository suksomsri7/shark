"use client";

// SVC B.6 — จัดการจอทีวี/ตู้รับบัตรของสาขา (พนักงานที่มี booking.devices.manage) · สัญญา DOM: ใบสั่ง §4
//   รายการอุปกรณ์ · เพิ่ม (ได้ลิงก์ครั้งเดียว) · เปลี่ยนลิงก์ (ลิงก์เดิมใช้ไม่ได้ทันที) · ถอน · ค่าตั้งรายเครื่อง (slot จากหน้า = SettingsForm ชั้น DEVICE)
// 🔴 ไม่มี token/hash ใน HTML — ลิงก์ที่มี token อยู่ในผลของ action เท่านั้น (แสดงครั้งเดียว ไม่เก็บ)
import { useActionState, useEffect, useState, type ReactNode } from "react";
import type { BookingDevice } from "@/lib/modules/booking/devices";

type Res = { ok: true; deviceId: string; url: string } | { ok: false; reason: string } | null;
type Act = (prev: unknown, fd: FormData) => Promise<unknown>;
type Props = {
  unitSlug: string;
  devices: BookingDevice[];
  actions: { create: Act; rotate: Act; revoke: (fd: FormData) => Promise<void> };
  settings?: Record<string, ReactNode>;
};
const KIND_TH = { TV: "จอทีวี", KIOSK: "ตู้รับบัตร" } as const;
const asRes = (x: unknown): Res => (x && typeof x === "object" && "ok" in x ? (x as Res) : null);

function OneTimeLink({ res }: { res: Res }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  if (!res) return null;
  if (!res.ok) return <p role="alert" className="text-sm text-[color:var(--color-danger)]">{res.reason}</p>;
  const full = `${origin}${res.url}`;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--color-accent)] p-3">
      <p className="text-sm font-semibold">ลิงก์ของเครื่องนี้ (แสดงครั้งเดียว — คัดลอกไปเปิดบนจอ/แท็บเล็ตหน้าร้าน)</p>
      <input readOnly value={full} className="input w-full font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn btn-ghost min-h-[44px] self-start text-sm" onClick={() => void navigator.clipboard?.writeText(full)}>
        คัดลอกลิงก์
      </button>
    </div>
  );
}

function DeviceRow({ d, actions, settings }: { d: BookingDevice; actions: Props["actions"]; settings?: ReactNode }) {
  const [rot, rotAction, rotPending] = useActionState(actions.rotate, null);
  return (
    <li data-bq-device={d.id} data-kind={d.kind} className="flex flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-[color:var(--color-surface-2)] px-2 py-0.5 text-xs font-semibold">{KIND_TH[d.kind]}</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{d.name}</span>
        <form action={rotAction}>
          <input type="hidden" name="deviceId" value={d.id} />
          <button type="submit" disabled={rotPending} className="btn btn-ghost min-h-[44px] text-sm">
            เปลี่ยนลิงก์
          </button>
        </form>
        <form
          action={actions.revoke}
          onSubmit={(e) => {
            if (!window.confirm(`ถอน "${d.name}"? ลิงก์ของเครื่องนี้จะใช้ไม่ได้ทันที`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="deviceId" value={d.id} />
          <button type="submit" data-bq-device-revoke={d.id} className="btn btn-ghost min-h-[44px] text-sm text-[color:var(--color-danger)]">
            ถอน
          </button>
        </form>
      </div>
      <OneTimeLink res={asRes(rot)} />
      {settings ? <details className="rounded-xl border border-[color:var(--color-line)] p-3"><summary className="min-h-[44px] cursor-pointer py-2 text-sm font-semibold">ค่าตั้งของเครื่องนี้</summary>{settings}</details> : null}
    </li>
  );
}

export default function DevicesPanel({ devices, actions, settings }: Props) {
  const [created, createAction, pending] = useActionState(actions.create, null);
  return (
    <div data-bq-devices="" className="flex w-full max-w-3xl flex-col gap-5">
      <form data-bq-device-create="" action={createAction} className="flex flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] p-4">
        <p className="font-semibold">เพิ่มจอ/ตู้</p>
        <div className="flex flex-wrap gap-3">
          <select name="kind" defaultValue="TV" className="input min-h-[44px]">
            <option value="TV">จอทีวี</option>
            <option value="KIOSK">ตู้รับบัตร</option>
          </select>
          <input name="name" required maxLength={60} placeholder="ชื่อเครื่อง เช่น จอหน้าร้าน" className="input min-h-[44px] min-w-0 flex-1" />
          <button type="submit" disabled={pending} className="btn btn-primary min-h-[44px]">
            เพิ่ม
          </button>
        </div>
        <OneTimeLink res={asRes(created)} />
      </form>
      {devices.length ? (
        <ul className="flex flex-col gap-3">
          {devices.map((d) => (
            <DeviceRow key={d.id} d={d} actions={actions} settings={settings?.[d.id]} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีจอหรือตู้ของสาขานี้</p>
      )}
    </div>
  );
}
