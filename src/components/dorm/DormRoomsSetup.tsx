'use client';
// SVC D.15-K2 ▸ จอ "อาคาร · ชั้น · ห้อง" + "ประเภทห้อง · ค่าเช่า" ของหอ (/dorm/settings/rooms)
//   ข้อมูลทั้งหมดจาก dormSetupModel (import type เท่านั้น) · action รับทาง prop · ปุ่มแก้แสดงตาม canEdit/canEditUnit (เซิร์ฟเวอร์ตรวจซ้ำเสมอ)
import { useState, useTransition } from "react";
import type { DormSetupModel } from "@/lib/modules/dorm";
import DormSettingsNav from "./DormSettingsNav";
import { bahtText } from "./dorm-home-shared";

type Res = { ok: true } | { ok: false; reason: string };
type Act = (input: Record<string, unknown>) => Promise<Res>;
type Props = {
  model: DormSetupModel;
  unitSlug: string;
  actions: { saveBuilding: Act; removeBuilding: Act; saveRoomType: Act; archiveRoomType: Act; saveRoom: Act; archiveRoom: Act };
};

const cardCls = "flex min-w-0 flex-col gap-3 rounded-2xl border bg-[color:var(--color-surface)] p-5";
const inputCls = "min-h-10 min-w-0 rounded-xl border bg-[color:var(--color-surface)] px-3 text-sm";
const btnCls = "min-h-10 rounded-xl bg-[color:var(--color-ink)] px-4 text-sm font-semibold text-[color:var(--color-surface)] disabled:opacity-50";
const linkBtn = "min-h-10 rounded-xl border px-3 text-sm disabled:opacity-50";
const dangerBtn = "min-h-10 rounded-xl px-3 text-sm text-[color:var(--color-danger)] underline disabled:opacity-50";
const muted = "text-sm text-[color:var(--color-muted)]";
const formObj = (e: React.FormEvent<HTMLFormElement>) => Object.fromEntries(new FormData(e.currentTarget).entries());

export default function DormRoomsSetup({ model, unitSlug, actions }: Props) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [editBuilding, setEditBuilding] = useState<string | null>(null);
  const [editType, setEditType] = useState<string | null>(null);
  const [editRoom, setEditRoom] = useState<string | null>(null);

  const run = (job: () => Promise<Res>, okText: string, after?: () => void) =>
    start(async () => {
      try {
        const r = await job();
        if (r.ok) after?.();
        setNotice(r.ok ? { ok: true, text: okText } : { ok: false, text: r.reason });
      } catch {
        setNotice({ ok: false, text: "บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง" });
      }
    });
  const submit = (act: Act, okText: string, extra: Record<string, unknown>, after?: () => void) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    run(() => act({ ...formObj(e), ...extra }), okText, () => {
      form.reset();
      after?.();
    });
  };

  return (
    <div data-dorm-rooms-setup="" className="flex w-full min-w-0 flex-col gap-5 lg:flex-row lg:items-start">
      <DormSettingsNav unitSlug={unitSlug} active="rooms" />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="min-w-0">
          <h1 className="text-xl font-bold text-[color:var(--color-ink)]">อาคาร · ชั้น · ห้อง · ประเภทห้อง</h1>
          <p className={muted}>
            {model.unitName}
            {model.limited ? " · คุณเห็นเฉพาะอาคารที่ได้รับมอบหมาย" : ""}
            {model.canEdit ? "" : " · ดูอย่างเดียว"}
          </p>
        </header>
        {notice ? (
          <p role="status" data-setup-notice={notice.ok ? "ok" : "err"} className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm" style={{ color: notice.ok ? "var(--color-ink)" : "var(--color-danger)" }}>
            {notice.text}
          </p>
        ) : null}

        {/* ── อาคาร ── */}
        <section data-setup-buildings="" className={cardCls}>
          <h2 className="text-base font-bold">อาคาร</h2>
          {model.buildings.length === 0 ? <p className={muted}>ยังไม่มีอาคาร{model.canEditUnit ? " — เพิ่มด้านล่าง" : ""}</p> : null}
          <ul className="flex flex-col gap-2">
            {model.buildings.map((b) =>
              editBuilding === b.id ? (
                <li key={b.id}>
                  <form onSubmit={submit(actions.saveBuilding, "บันทึกอาคารแล้ว", { buildingId: b.id }, () => setEditBuilding(null))} className="flex flex-wrap items-end gap-2">
                    <input name="name" defaultValue={b.name} required maxLength={60} aria-label="ชื่ออาคาร" className={inputCls} />
                    <input name="floors" type="number" min={1} max={99} defaultValue={b.floors} required aria-label="จำนวนชั้น" className={`${inputCls} w-20`} />
                    <button disabled={pending} className={btnCls}>บันทึก</button>
                    <button type="button" onClick={() => setEditBuilding(null)} className={linkBtn}>ยกเลิก</button>
                  </form>
                </li>
              ) : (
                <li key={b.id} data-building={b.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2">
                  <span className="min-w-0 text-sm">
                    <b>{b.name}</b> · {b.floors} ชั้น · {b.roomCount} ห้อง
                  </span>
                  {model.canEditUnit ? (
                    <span className="flex gap-1">
                      <button type="button" disabled={pending} onClick={() => setEditBuilding(b.id)} className={linkBtn}>แก้ไข</button>
                      <button type="button" disabled={pending || b.roomCount > 0} title={b.roomCount > 0 ? "ย้ายหรือปิดห้องในอาคารก่อน" : undefined} onClick={() => run(() => actions.removeBuilding({ buildingId: b.id }), "ลบอาคารแล้ว")} className={dangerBtn}>ลบ</button>
                    </span>
                  ) : null}
                </li>
              ),
            )}
          </ul>
          {model.canEditUnit ? (
            <form data-add-building="" onSubmit={submit(actions.saveBuilding, "เพิ่มอาคารแล้ว", {})} className="flex flex-wrap items-end gap-2 border-t pt-3">
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-[color:var(--color-muted)]">ชื่ออาคาร</span>
                <input name="name" required maxLength={60} placeholder="เช่น อาคาร A" className={inputCls} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-[color:var(--color-muted)]">จำนวนชั้น</span>
                <input name="floors" type="number" min={1} max={99} defaultValue={3} required className={`${inputCls} w-20`} />
              </label>
              <button disabled={pending} className={btnCls}>เพิ่มอาคาร</button>
            </form>
          ) : null}
        </section>

        {/* ── ประเภทห้อง · ค่าเช่า ── */}
        <section id="types" data-setup-types="" className={cardCls}>
          <h2 className="text-base font-bold">ประเภทห้อง · ค่าเช่ารายเดือน</h2>
          <p className={muted}>ค่าเช่าใหม่ใช้กับสัญญาใหม่ — สัญญาเดิมล็อกค่าเช่าตามที่ทำไว้</p>
          {model.roomTypes.length === 0 ? <p className={muted}>ยังไม่มีประเภทห้อง</p> : null}
          <ul className="flex flex-col gap-2">
            {model.roomTypes.map((t) =>
              editType === t.id ? (
                <li key={t.id}>
                  <form onSubmit={submit(actions.saveRoomType, "บันทึกประเภทห้องแล้ว", { roomTypeId: t.id }, () => setEditType(null))} className="flex flex-wrap items-end gap-2">
                    <input name="name" defaultValue={t.name} required maxLength={60} aria-label="ชื่อประเภทห้อง" className={inputCls} />
                    <input name="rentBaht" inputMode="decimal" defaultValue={t.monthlyRateSatang !== null ? (t.monthlyRateSatang / 100).toFixed(2) : ""} required aria-label="ค่าเช่า บาท/เดือน" className={`${inputCls} w-32`} />
                    <button disabled={pending} className={btnCls}>บันทึก</button>
                    <button type="button" onClick={() => setEditType(null)} className={linkBtn}>ยกเลิก</button>
                  </form>
                </li>
              ) : (
                <li key={t.id} data-room-type={t.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2">
                  <span className="min-w-0 text-sm">
                    <b>{t.name}</b> · {t.monthlyRateSatang !== null ? `฿${bahtText(t.monthlyRateSatang)}/เดือน` : "ยังไม่ตั้งค่าเช่า"} · {t.roomCount} ห้อง
                  </span>
                  {model.canEditUnit ? (
                    <span className="flex gap-1">
                      <button type="button" disabled={pending} onClick={() => setEditType(t.id)} className={linkBtn}>แก้ไข</button>
                      <button type="button" disabled={pending || t.roomCount > 0} title={t.roomCount > 0 ? "เปลี่ยนประเภทของห้องก่อน" : undefined} onClick={() => run(() => actions.archiveRoomType({ roomTypeId: t.id }), "ลบประเภทห้องแล้ว")} className={dangerBtn}>ลบ</button>
                    </span>
                  ) : null}
                </li>
              ),
            )}
          </ul>
          {model.canEditUnit ? (
            <form data-add-room-type="" onSubmit={submit(actions.saveRoomType, "เพิ่มประเภทห้องแล้ว", {})} className="flex flex-wrap items-end gap-2 border-t pt-3">
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-xs text-[color:var(--color-muted)]">ชื่อประเภท</span>
                <input name="name" required maxLength={60} placeholder="เช่น ห้องมาตรฐาน" className={inputCls} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-[color:var(--color-muted)]">ค่าเช่า (บาท/เดือน)</span>
                <input name="rentBaht" inputMode="decimal" required placeholder="4500" className={`${inputCls} w-32`} />
              </label>
              <button disabled={pending} className={btnCls}>เพิ่มประเภท</button>
            </form>
          ) : null}
        </section>

        {/* ── ห้อง ── */}
        <section data-setup-rooms="" className={cardCls}>
          <h2 className="text-base font-bold">ห้อง ({model.rooms.length})</h2>
          {model.rooms.length === 0 ? <p className={muted}>ยังไม่มีห้อง</p> : null}
          <ul className="flex flex-col gap-2">
            {model.rooms.map((r) =>
              editRoom === r.id ? (
                <li key={r.id}>
                  <RoomForm
                    model={model}
                    pending={pending}
                    defaults={{ number: r.number, buildingId: r.buildingId ?? model.buildings[0]?.id ?? "", floorNo: r.floorNo ?? 1, roomTypeId: r.roomTypeId }}
                    onSubmit={submit(actions.saveRoom, "บันทึกห้องแล้ว", { roomId: r.id }, () => setEditRoom(null))}
                    onCancel={() => setEditRoom(null)}
                    label="บันทึก"
                  />
                </li>
              ) : (
                <li key={r.id} data-room={r.number} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2">
                  <span className="min-w-0 text-sm">
                    <b>ห้อง {r.number}</b> · {r.buildingName ?? "ไม่ระบุอาคาร"}
                    {r.floorNo !== null ? ` · ชั้น ${r.floorNo}` : ""} · {r.roomTypeName}
                    {r.inUse ? " · มีผู้เช่า/สัญญา" : ""}
                  </span>
                  {model.canEdit ? (
                    <span className="flex gap-1">
                      <button type="button" disabled={pending} onClick={() => setEditRoom(r.id)} className={linkBtn}>แก้ไข</button>
                      <button type="button" disabled={pending || r.inUse} title={r.inUse ? "ห้องนี้ยังมีสัญญาหรือการจองที่ยังไม่จบ" : undefined} onClick={() => run(() => actions.archiveRoom({ roomId: r.id }), `ปิดห้อง ${r.number} แล้ว`)} className={dangerBtn}>ปิดห้อง</button>
                    </span>
                  ) : null}
                </li>
              ),
            )}
          </ul>
          {model.canEdit && model.buildings.length > 0 && model.roomTypes.length > 0 ? (
            <div data-add-room="" className="border-t pt-3">
              <RoomForm
                model={model}
                pending={pending}
                defaults={{ number: "", buildingId: model.buildings[0]?.id ?? "", floorNo: 1, roomTypeId: model.roomTypes[0]?.id ?? "" }}
                onSubmit={submit(actions.saveRoom, "เพิ่มห้องแล้ว · สร้างมิเตอร์ไฟและน้ำให้แล้ว", {})}
                label="เพิ่มห้อง"
                meters
              />
            </div>
          ) : model.canEdit ? (
            <p className={muted}>เพิ่มอาคารและประเภทห้องก่อนจึงเพิ่มห้องได้ (หรือนำเข้าจากไฟล์ที่หน้าผู้เช่า/สัญญา › นำเข้า)</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function RoomForm(p: {
  model: DormSetupModel;
  pending: boolean;
  defaults: { number: string; buildingId: string; floorNo: number; roomTypeId: string };
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  label: string;
  /** ฟอร์มเพิ่มห้อง ⇒ ช่องเลขมิเตอร์เริ่มต้น (สร้างมิเตอร์ไฟ+น้ำให้ห้อง) */
  meters?: boolean;
}) {
  const [bid, setBid] = useState(p.defaults.buildingId);
  const floors = Array.from({ length: p.model.buildings.find((b) => b.id === bid)?.floors ?? 1 }, (_, i) => i + 1);
  return (
    <form onSubmit={p.onSubmit} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[color:var(--color-muted)]">เลขห้อง</span>
        <input name="number" required maxLength={20} defaultValue={p.defaults.number} placeholder="203" className={`${inputCls} w-24`} />
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-[color:var(--color-muted)]">อาคาร</span>
        <select
          name="buildingId"
          value={bid}
          onChange={(e) => setBid(e.target.value)}
          className={inputCls}
        >
          {p.model.buildings.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-[color:var(--color-muted)]">ชั้น</span>
        <select name="floorNo" defaultValue={String(p.defaults.floorNo)} className={`${inputCls} w-20`}>
          {floors.map((n) => (
            <option key={n} value={String(n)}>{n}</option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-[color:var(--color-muted)]">ประเภทห้อง</span>
        <select name="roomTypeId" defaultValue={p.defaults.roomTypeId} className={inputCls}>
          {p.model.roomTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>
      {p.meters ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">เลขไฟเริ่มต้น</span>
            <input name="elecStart" inputMode="numeric" placeholder="0" className={`${inputCls} w-24`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[color:var(--color-muted)]">เลขน้ำเริ่มต้น</span>
            <input name="waterStart" inputMode="numeric" placeholder="0" className={`${inputCls} w-24`} />
          </label>
        </>
      ) : null}
      <button disabled={p.pending} className={btnCls}>{p.label}</button>
      {p.onCancel ? (
        <button type="button" onClick={p.onCancel} className={linkBtn}>ยกเลิก</button>
      ) : null}
    </form>
  );
}
