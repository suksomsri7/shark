"use client";

// ─────────────────────────────────────────────────────────────
// BookingServicesSettings.tsx — จอง 11 "บริการ · วิธีจอง" · SVC B.11 §5.2
//   ตาราง 8 คอลัมน์ · แผงขวาตั้งค่าการจองของบริการที่เลือก (คอลัมน์เดิม: เก็บห้อง/จองออนไลน์/มัดจำ + ค่าตั้งชั้นบริการ)
//   ใครทำได้ (ราคา/เวลาเฉพาะคน) · กล่องค่าร้าน (ใช้เมื่อบริการไม่ได้ตั้งเอง)
// 🔴 ราคา/เวลาต้นฉบับอยู่แคตตาล็อกสินค้า/บริการ (มติเจ้าของ 13 ส.ค.) · ไม่มีคีย์ค่าตั้งในไฟล์นี้ · ไม่มี useRouter
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import { fieldsOf, type ServiceRow, type ServicesModel } from "./booking-settings-shared";
import {
  BTN,
  BTN_GHOST,
  BTN_PRIMARY,
  CARD,
  cx,
  DraftProvider,
  failText,
  MUTED,
  PageHead,
  SettingRows,
  Switch,
  type BookingSettingsActions,
} from "./BookingPolicySettings";

const baht = (satang: number): string => {
  const whole = Math.floor(Math.abs(satang) / 100);
  const frac = Math.abs(satang) % 100;
  const w = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `฿${frac ? `${w}.${String(frac).padStart(2, "0")}` : w}`;
};
const toSatang = (t: string): number | null => {
  const c = t.replace(/[,\s฿]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(c)) return null;
  const [a, b = ""] = c.split(".");
  return Number(a) * 100 + Number(b.padEnd(2, "0"));
};

function ServicesTable({ model }: { model: ServicesModel }) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-[color:var(--color-surface)]">
      <table data-bk-services-table="" className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className={cx("bg-[color:var(--color-surface-2)] text-left text-xs", MUTED)}>
            <th className="px-3 py-2.5 font-semibold">บริการ</th>
            <th className="px-3 py-2.5 font-semibold">นาที · เก็บห้อง</th>
            <th className="px-3 py-2.5 font-semibold">ราคา</th>
            <th className="px-3 py-2.5 font-semibold">มัดจำ</th>
            <th className="px-3 py-2.5 font-semibold">ต้องใช้</th>
            <th className="px-3 py-2.5 font-semibold">คนทำได้</th>
            <th className="px-3 py-2.5 font-semibold">จองออนไลน์</th>
            <th className="px-3 py-2.5 font-semibold">walk-in</th>
          </tr>
        </thead>
        <tbody>
          {model.rows.map((r) => {
            const sel = r.id === model.selectedId;
            return (
              <tr key={r.id} data-service-id={r.id} data-selected={String(sel)} className={cx("border-t", sel && "bg-[color:var(--color-accent-soft)]")}>
                <td data-col="name" className="px-3 py-2 font-semibold">
                  <a href={`?service=${encodeURIComponent(r.id)}`} className="inline-flex min-h-11 items-center" aria-current={sel ? "true" : undefined}>
                    {r.name}
                  </a>
                </td>
                <td data-col="minutes" className="px-3 py-2">{`${r.durationMin} · ${r.bufferMin}`}</td>
                <td data-col="price" className="px-3 py-2">{baht(r.priceSatang)}</td>
                <td data-col="deposit" className="px-3 py-2">{r.depositSatang > 0 ? baht(r.depositSatang) : "—"}</td>
                <td data-col="requires" className="px-3 py-2">{r.requiresTh}</td>
                <td data-col="staff" className="px-3 py-2">{`${r.canCount}/${r.staffTotal}`}</td>
                <td data-col="online" className="px-3 py-2">{r.bookable ? "✓" : "—"}</td>
                <td data-col="walkin" className="px-3 py-2">{r.walkIn ? "✓" : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {model.rows.length === 0 && <p className={cx("p-4 text-sm", MUTED)}>ยังไม่มีบริการที่เปิดรับจองในสาขานี้ — ติ๊กเปิดรับจองจากแคตตาล็อกด้านล่าง</p>}
    </div>
  );
}

/** แถวคอลัมน์เดิมของบริการ (ไม่ใช่ค่าตั้ง — เขียนผ่าน setServiceBooking) */
function ColumnField({
  field,
  label,
  help,
  shown,
  editable,
  onSave,
  kind,
  current,
}: {
  field: "bufferMin" | "bookable" | "depositSatang";
  label: string;
  help?: string;
  shown: string;
  editable: boolean;
  onSave: (v: number | boolean) => Promise<string | null>;
  kind: "minutes" | "money" | "bool";
  current: number | boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(kind === "money" ? String((current as number) / 100) : String(current));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (v: number | boolean) => {
    setBusy(true);
    setErr(null);
    const e = await onSave(v);
    setBusy(false);
    if (e) setErr(e);
    else setOpen(false);
  };
  return (
    <div data-bk-col-field={field} {...(!editable ? { "data-locked": "true" } : {})} className="flex flex-col gap-2 border-b py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{label}</div>
          {help && <div className={cx("text-xs", MUTED)}>{help}</div>}
        </div>
        {kind === "bool" ? (
          <Switch checked={current === true} disabled={!editable || busy} label={label} onChange={(v) => void save(v)} />
        ) : editable ? (
          <button type="button" className={cx(BTN, "font-semibold")} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {shown}
          </button>
        ) : (
          <span className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold">{shown}</span>
        )}
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[color:var(--color-surface-2)] p-3">
          <input className="input min-h-11 w-32" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} aria-label={label} />
          <span className={cx("text-sm", MUTED)}>{kind === "money" ? "บาท" : "นาที"}</span>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy}
            onClick={() => {
              const v = kind === "money" ? toSatang(text) : /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
              if (v === null) setErr("กรอกเป็นตัวเลขที่ไม่ติดลบ");
              else void save(v);
            }}
          >
            บันทึก
          </button>
          <button type="button" className={BTN_GHOST} onClick={() => setOpen(false)}>
            ยกเลิก
          </button>
        </div>
      )}
      {err && <span className="text-xs text-[color:var(--color-danger)]">{err}</span>}
    </div>
  );
}

function WhoRow({ model, w, svc, actions }: { model: ServicesModel; w: ServicesModel["who"][number]; svc: ServiceRow; actions: BookingSettingsActions }) {
  const [open, setOpen] = useState(false);
  const [can, setCan] = useState(w.can);
  const [price, setPrice] = useState(w.priceSatang === null ? "" : String(w.priceSatang / 100));
  const [dur, setDur] = useState(w.durationMin === null ? "" : String(w.durationMin));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const text = !w.can
    ? "ไม่รับบริการนี้"
    : w.priceSatang === null && w.durationMin === null
      ? "ตามค่าบริการ"
      : [w.priceSatang !== null ? `${baht(w.priceSatang)}${w.priceSatang > svc.priceSatang ? ` (+${baht(w.priceSatang - svc.priceSatang)})` : ""}` : "", w.durationMin !== null ? `ใช้เวลา ${w.durationMin} นาที` : ""]
          .filter(Boolean)
          .join(" · ");
  const save = async () => {
    if (!actions.setStaffService) return;
    const p = price.trim() === "" ? null : toSatang(price);
    const d = dur.trim() === "" ? null : /^\d+$/.test(dur.trim()) ? Number(dur.trim()) : NaN;
    if ((price.trim() !== "" && p === null) || Number.isNaN(d)) {
      setErr("ราคา/เวลาต้องเป็นตัวเลข (เว้นว่าง = ตามค่าบริการ)");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await actions.setStaffService({ staffId: w.staffId, serviceId: svc.id, can, priceSatang: can ? p : null, durationMin: can ? (d as number | null) : null });
      if (r.ok) setOpen(false);
      else setErr(failText(r));
    } catch {
      setErr("บันทึกไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      data-staff-id={w.staffId}
      data-can={String(w.can)}
      data-price-satang={w.priceSatang === null ? "" : String(w.priceSatang)}
      data-duration-min={w.durationMin === null ? "" : String(w.durationMin)}
      className={cx("flex flex-col gap-2 rounded-xl border px-3 py-1", !w.can && "opacity-60")}
    >
      <div className="flex min-h-11 items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded border text-xs">{w.name.slice(0, 1)}</span>
          {w.name}
        </span>
        {model.canEditWho ? (
          <button type="button" className={cx("inline-flex min-h-11 items-center text-xs", MUTED)} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {text}
          </button>
        ) : (
          <span className={cx("text-xs", MUTED)}>{text}</span>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-2 rounded-xl bg-[color:var(--color-surface-2)] p-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>รับบริการนี้</span>
            <Switch checked={can} label={`${w.name} รับบริการนี้`} onChange={setCan} />
          </div>
          {can && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className={MUTED}>ราคาเฉพาะคน (บาท · ว่าง = ตามบริการ){model.canEditMoney ? "" : " — ต้องมีสิทธิ์เรื่องเงิน"}</span>
                <input className="input min-h-11" inputMode="decimal" value={price} disabled={!model.canEditMoney} onChange={(e) => setPrice(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className={MUTED}>เวลาเฉพาะคน (นาที · ว่าง = ตามบริการ)</span>
                <input className="input min-h-11" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} />
              </label>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void save()}>
              บันทึก
            </button>
            <button type="button" className={BTN_GHOST} onClick={() => setOpen(false)}>
              ยกเลิก
            </button>
          </div>
          {err && <span className="text-xs text-[color:var(--color-danger)]">{err}</span>}
        </div>
      )}
    </div>
  );
}

function ServicePanel({ model, actions }: { model: ServicesModel; actions: BookingSettingsActions }) {
  const svc = model.rows.find((r) => r.id === model.selectedId);
  if (!svc) return null;
  const sf = model.serviceForm;
  const call = async (input: { bufferMin?: number; bookable?: boolean; depositSatang?: number }): Promise<string | null> => {
    if (!actions.setServiceBooking) return "บันทึกไม่ได้";
    try {
      const r = await actions.setServiceBooking({ serviceId: svc.id, ...input });
      return r.ok ? null : failText(r);
    } catch {
      return "บันทึกไม่สำเร็จ ลองอีกครั้ง";
    }
  };
  return (
    <aside data-bk-service-panel="" data-service-id={svc.id} className="flex flex-col gap-1 rounded-2xl border-2 border-[color:var(--color-accent)] bg-[color:var(--color-surface)] p-4 sm:p-5">
      <h2 className="pb-1 text-base font-bold">{`${svc.name} · ตั้งค่าการจอง`}</h2>
      <div className={cx("text-xs", MUTED)}>เวลาบริการ {svc.durationMin} นาที · ราคา {baht(svc.priceSatang)} (แก้ที่แคตตาล็อก)</div>
      <ColumnField field="bufferMin" label="เก็บห้อง/พักหลังบริการ" kind="minutes" current={svc.bufferMin} shown={`${svc.bufferMin} นาที`} editable={model.canEditService} onSave={(v) => call({ bufferMin: v as number })} />
      <ColumnField field="bookable" label="จองออนไลน์ได้" help="ปิด = รับเฉพาะหน้าร้าน/ทางโทรศัพท์" kind="bool" current={svc.bookable} shown={svc.bookable ? "เปิด" : "ปิด"} editable={model.canEditService} onSave={(v) => call({ bookable: v as boolean })} />
      <ColumnField
        field="depositSatang"
        label="มัดจำของบริการนี้"
        help={model.canEditMoney ? "0 = ใช้ค่าร้าน (ไม่เก็บ)" : "แก้ได้เฉพาะผู้มีสิทธิ์เรื่องเงิน"}
        kind="money"
        current={svc.depositSatang}
        shown={svc.depositSatang > 0 ? baht(svc.depositSatang) : "ใช้ค่าร้าน (ไม่เก็บ)"}
        editable={model.canEditService && model.canEditMoney}
        onSave={(v) => call({ depositSatang: v as number })}
      />
      {sf && <SettingRows form={sf} />}
      <div className="pt-3 text-sm font-bold">ใครทำได้ (ราคา/เวลาเฉพาะคน)</div>
      <p className={cx("text-xs", MUTED)}>ตั้งราคา/เวลาเฉพาะคนแล้ว ระบบผูกบริการที่คนนั้นทำได้ให้ครบทุกบริการ (ใครทำอะไรได้ยังเหมือนเดิม)</p>
      <div data-bk-who="" className="flex flex-col gap-2 pt-1">
        {model.who.map((w) => (
          <WhoRow key={w.staffId} model={model} w={w} svc={svc} actions={actions} />
        ))}
      </div>
    </aside>
  );
}

export default function BookingServicesSettings({ model, actions }: { model: ServicesModel; actions: BookingSettingsActions }) {
  const shopKeys = fieldsOf(model.shopForm).map((f) => f.key);
  return (
    <DraftProvider forms={[model.shopForm, model.serviceForm]} actions={actions}>
      <div data-bk-settings-page="services" className="flex flex-col gap-5">
        <PageHead title="บริการ · วิธีจอง" desc={`${model.unitName} · ${model.rows.length} บริการเปิดจอง · ช่องว่าง = ใช้ค่าร้าน`} />
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="flex min-w-0 flex-col gap-4">
            <ServicesTable model={model} />
            <p className={cx("text-xs", MUTED)}>บริการต้นฉบับ (ชื่อ/ราคา/เวลา) มาจากแคตตาล็อกสินค้า-บริการกลาง · หน้านี้ตั้งเฉพาะ “วิธีจอง” ของสาขานี้</p>
            <section data-bk-shop-defaults="" className={CARD}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 pb-1">
                <h2 className="text-base font-bold">ค่าร้าน (ใช้เมื่อบริการไม่ได้ตั้งเอง)</h2>
                <a href={`${model.basePath}/settings`} className={cx("inline-flex min-h-11 items-center text-xs", MUTED)}>
                  ตั้งที่ ตั้งค่า › แม่แบบและนโยบาย
                </a>
              </div>
              <SettingRows form={model.shopForm} keys={shopKeys} ownLabel="ตั้งรายบริการ" />
            </section>
          </div>
          <ServicePanel model={model} actions={actions} />
        </div>
      </div>
    </DraftProvider>
  );
}
