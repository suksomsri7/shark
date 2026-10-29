"use client";

// ─────────────────────────────────────────────────────────────
// BookingStaffSettings.tsx — จอง 12 ส่วน "คน" (ผู้ให้บริการ) · SVC B.11 §5.3
//   ตาราง: เวลาทำงานมาจาก · % จองออนไลน์ · บริการที่ทำได้ · ค่าคอมฯ (+ เตือนคนที่ยังไม่ผูกทะเบียนพนักงาน)
//   แผงขวา: แหล่งเวลา + แถบสัปดาห์ + ค่าตั้งชั้นผู้ให้บริการ · กล่องค่าร้าน
//   (ตารางทรัพยากร = B.13)
// 🔴 ไม่มีคีย์ค่าตั้งในไฟล์นี้ · ไม่ import ค่าจาก server · ไม่มี useRouter
// ─────────────────────────────────────────────────────────────
import { fieldsOf, hourText, HOURS_SOURCE_TH, WEEKDAY_TH, type StaffModel } from "./booking-settings-shared";
import { CARD, cx, DraftProvider, MUTED, PageHead, SettingRows, type BookingSettingsActions } from "./BookingPolicySettings";

const pctBp = (bp: number): string => `${(bp / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

function StaffTable({ model }: { model: StaffModel }) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-[color:var(--color-surface)]">
      <table data-bk-staff-table="" className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className={cx("bg-[color:var(--color-surface-2)] text-left text-xs", MUTED)}>
            <th className="px-3 py-2.5 font-semibold">{model.providerLabel}</th>
            <th className="px-3 py-2.5 font-semibold">เวลาทำงานมาจาก</th>
            <th className="px-3 py-2.5 font-semibold">จองออนไลน์</th>
            <th className="px-3 py-2.5 font-semibold">บริการที่ทำได้</th>
            <th className="px-3 py-2.5 font-semibold">ค่าคอมฯ</th>
          </tr>
        </thead>
        <tbody>
          {model.rows.map((r) => {
            const sel = r.id === model.selectedId;
            return (
              <tr key={r.id} data-staff-id={r.id} data-hours-source={r.hoursSource} className={cx("border-t align-top", sel && "bg-[color:var(--color-accent-soft)]")}>
                <td data-col="name" className="px-3 py-2">
                  <a href={`?staff=${encodeURIComponent(r.id)}`} className="inline-flex min-h-11 items-center font-semibold" aria-current={sel ? "true" : undefined}>
                    {r.name}
                  </a>
                  {!r.linked && (
                    <div data-bk-warn="no-user" className="text-xs text-[color:var(--color-danger)]">
                      ยังไม่ผูกทะเบียนพนักงาน — ค่าคอมฯ ไม่ถูกบันทึกเข้าเงินเดือน
                    </div>
                  )}
                </td>
                <td data-col="hours" className="px-3 py-2">{HOURS_SOURCE_TH[r.hoursSource]}</td>
                <td data-col="online" className="px-3 py-2">{`${r.onlinePct}%`}</td>
                <td data-col="services" className="px-3 py-2">{r.servicesTh}</td>
                <td data-col="commission" className="px-3 py-2">{r.commissionBp === null ? "—" : pctBp(r.commissionBp)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {model.rows.length === 0 && <p className={cx("p-4 text-sm", MUTED)}>ยังไม่มี{model.providerLabel}ที่รับคิวในสาขานี้ — ติ๊กพนักงานที่รับคิวด้านล่าง</p>}
    </div>
  );
}

function StaffPanel({ model }: { model: StaffModel }) {
  const row = model.rows.find((r) => r.id === model.selectedId);
  if (!row) return null;
  return (
    <aside data-bk-staff-panel="" data-staff-id={row.id} className="flex flex-col gap-2 rounded-2xl border-2 border-[color:var(--color-accent)] bg-[color:var(--color-surface)] p-4 sm:p-5">
      <h2 className="text-base font-bold">{`${row.name} · ตั้งค่าการรับงาน`}</h2>
      <div className="flex items-center justify-between gap-2 border-b pb-3">
        <div>
          <div className="text-sm font-medium">เวลาทำงานมาจาก</div>
          <div className={cx("text-xs", MUTED)}>{row.linked ? "ลา/ขาดในระบบพนักงานปิดช่องจองเอง" : "ยังไม่ผูกทะเบียนพนักงาน — ใช้ตารางสัปดาห์หรือเวลาร้าน"}</div>
        </div>
        <span className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold">{HOURS_SOURCE_TH[row.hoursSource]}</span>
      </div>
      <div className={cx("text-xs", MUTED)}>{row.hoursSource === "STAFF_WEEKLY" ? "ตารางประจำสัปดาห์" : "เวลาร้าน (สำรองเมื่อไม่ได้จัดกะ)"}</div>
      <div data-bk-week="" className="grid grid-cols-7 gap-1.5">
        {model.week.map((w) => {
          const off = w.startMin === null || w.endMin === null;
          return (
            <div
              key={w.weekday}
              data-weekday={String(w.weekday)}
              className={cx("flex flex-col items-center rounded-lg border px-1 py-2 text-xs", off && "bg-[color:var(--color-surface-2)] text-[color:var(--color-muted)]")}
            >
              <span className="font-semibold">{WEEKDAY_TH[w.weekday]}</span>
              <span>{off ? "หยุด" : `${hourText(w.startMin as number)}–${hourText(w.endMin as number)}`}</span>
            </div>
          );
        })}
      </div>
      {model.staffForm && <SettingRows form={model.staffForm} />}
    </aside>
  );
}

export default function BookingStaffSettings({ model, actions }: { model: StaffModel; actions: BookingSettingsActions }) {
  const shopKeys = fieldsOf(model.shopForm).map((f) => f.key);
  return (
    <DraftProvider forms={[model.shopForm, model.staffForm]} actions={actions}>
      <div data-bk-settings-page="staff" className="flex flex-col gap-5">
        <PageHead title={model.providerLabel} desc={`${model.unitName} · ${model.rows.length} คน · ทะเบียนคนอยู่ระบบพนักงาน · ที่นี่ตั้ง “การรับงาน”`} />
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex min-w-0 flex-col gap-4">
            <StaffTable model={model} />
            <section data-bk-shop-defaults="" className={CARD}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 pb-1">
                <h2 className="text-base font-bold">ค่าร้าน (ใช้เมื่อ{model.providerLabel}ไม่ได้ตั้งเอง)</h2>
                <a href={`${model.basePath}/settings`} className={cx("inline-flex min-h-11 items-center text-xs", MUTED)}>
                  ตั้งที่ ตั้งค่า › แม่แบบและนโยบาย
                </a>
              </div>
              <SettingRows form={model.shopForm} keys={shopKeys} ownLabel="ตั้งรายคน" />
            </section>
          </div>
          <StaffPanel model={model} />
        </div>
      </div>
    </DraftProvider>
  );
}
