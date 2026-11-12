"use client";
// SVC H.3 ▸ วิซาร์ดจองหน้าเคาน์เตอร์ 3 ขั้น (ใบสั่ง h.3 §4 · มติ 12): ขั้น 1 วัน/ประเภท/จำนวนห้อง (ห้องเหลือจาก availability + ราคารวมโดยประมาณ)
//   → ขั้น 2 ผู้เข้าพัก/แผน/แหล่ง → ขั้น 3 ยืนยัน + รับมัดจำทันที (เงินสด · พร้อมเพย์ · โอน · บัตร) หรือ «รอโอน» (ถือห้องตามเวลาที่ร้านตั้ง)
//   • query เติมฟอร์ม/เปิดขั้นเท่านั้น (checkIn · checkOut · roomTypeId · rooms · step) — ฝั่งเซิร์ฟเวอร์ตรวจทุกอย่างซ้ำใน createBooking
//   • ขั้น 3 ผู้เข้าพักเริ่มว่าง ⇒ ปุ่มยืนยันกดไม่ได้จนกรอกชื่อ
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  COUNTER_SOURCES,
  DEPOSIT_CHOICES,
  SOURCE_TH,
  addDaysStr,
  daysBetween,
  moneyTh,
  stayTh,
  type BookingAction,
  type WizardModel,
} from "./booking-shared";

type Props = { model: WizardModel; actions: { create: BookingAction; takeDeposit: BookingAction } };

const INPUT = "min-h-11 w-full rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-sm";
const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm";
const BTN_PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const CARD = "flex min-w-0 flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4";
/** วิธีรับมัดจำทันที (ตรงกับ POS) — นอกนั้น = รอโอน */
const PAY_NOW = ["CASH", "PROMPTPAY", "TRANSFER", "CARD"];
const STEPS = [
  { n: 1, labelTh: "ขั้น 1 เลือกวันและห้อง" },
  { n: 2, labelTh: "ขั้น 2 ผู้เข้าพัก" },
  { n: 3, labelTh: "ขั้น 3 ยืนยันและมัดจำ" },
];

export default function BookingWizard({ model, actions }: Props) {
  const router = useRouter();
  const base = `/app/u/${model.unitSlug}/hotel/reservations`;
  const typeOk = model.roomTypes.some((t) => t.id === model.roomTypeId);
  const [step, setStep] = useState(typeOk ? model.step : 1);
  const [checkIn, setCheckIn] = useState(model.checkIn);
  const [checkOut, setCheckOut] = useState(model.checkOut);
  const [roomTypeId, setRoomTypeId] = useState(typeOk ? model.roomTypeId : (model.roomTypes[0]?.id ?? ""));
  const [rooms, setRooms] = useState(model.rooms);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [ratePlanId, setRatePlanId] = useState(model.plans.find((p) => p.isDefault)?.id ?? model.plans[0]?.id ?? "");
  const [source, setSource] = useState("WALK_IN");
  const [channelRef, setChannelRef] = useState("");
  const [note, setNote] = useState("");
  const [depositChoice, setDepositChoice] = useState("CASH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const type = model.roomTypes.find((t) => t.id === roomTypeId) ?? null;
  const nights = daysBetween(checkIn, checkOut);
  const datesChanged = checkIn !== model.checkIn || checkOut !== model.checkOut;
  const maxRooms = Math.max(1, Math.min(10, type?.available ?? 1));
  const reload = () => {
    const q = new URLSearchParams({ checkIn, checkOut, roomTypeId, rooms: String(rooms), step: "1" });
    router.push(`${base}/new?${q.toString()}`);
  };
  const submit = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await actions.create({
        rooms: Array.from({ length: rooms }, () => ({ roomTypeId, adults, children })),
        checkIn,
        checkOut,
        ratePlanId: ratePlanId || null,
        source,
        guest: { name: guestName.trim(), phone: guestPhone.trim() || null, email: guestEmail.trim() || null },
        note: note.trim() || null,
        channelRef: source === "OTA" ? channelRef.trim() : null,
        hold: depositChoice === "WAIT_TRANSFER" ? "COUNTER" : null,
      });
      if (!r.ok) {
        setError(r.reason || "จองไม่สำเร็จ");
        return;
      }
      const list = Array.isArray(r.reservations) ? (r.reservations as { id: string }[]) : [];
      const firstId = list[0]?.id ?? "";
      if (PAY_NOW.includes(depositChoice) && Number(r.depositRequiredSatang) > 0 && firstId) {
        await actions.takeDeposit({ reservationId: firstId, payType: depositChoice });
      }
      router.push(firstId ? `${base}/${firstId}` : base);
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-booking-wizard="" data-step={step} className="flex w-full min-w-0 max-w-3xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <a href={base} className="text-sm text-[color:var(--color-muted)]">
          ← การจองทั้งหมด
        </a>
        <h1 className="text-xl font-bold text-[color:var(--color-ink)]">จองห้องพัก</h1>
      </header>
      <ol className="flex flex-wrap gap-2 text-sm" aria-label="ขั้นตอน">
        {STEPS.map((s) => (
          <li key={s.n} data-wizard-step={s.n} aria-current={s.n === step ? "step" : undefined} className={`rounded-full border px-3 py-1 ${s.n === step ? "border-[color:var(--color-accent)] font-bold" : "border-[color:var(--color-line)] text-[color:var(--color-muted)]"}`}>
            {s.labelTh}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <section className={CARD}>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span>วันเข้าพัก</span>
              <input type="date" value={checkIn} min={model.today} onChange={(e) => setCheckIn(e.target.value)} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>วันออก</span>
              <input type="date" value={checkOut} min={addDaysStr(checkIn, 1)} onChange={(e) => setCheckOut(e.target.value)} className={INPUT} />
            </label>
          </div>
          {datesChanged ? (
            <button type="button" className={BTN} onClick={reload}>
              ดูห้องว่างของวันที่เลือก
            </button>
          ) : null}
          <div className="flex flex-col gap-2" data-room-types="">
            {model.roomTypes.map((t) => (
              <label key={t.id} data-room-type={t.id} className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border p-3 ${t.id === roomTypeId ? "border-[color:var(--color-accent)]" : "border-[color:var(--color-line)]"} ${t.available === 0 ? "opacity-60" : ""}`}>
                <span className="flex items-center gap-2">
                  <input type="radio" name="roomTypeId" checked={t.id === roomTypeId} onChange={() => setRoomTypeId(t.id)} disabled={t.available === 0} />
                  <span className="flex flex-col">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-xs text-[color:var(--color-muted)]">
                      ว่าง {t.available} จาก {t.total} ห้อง · พักได้ {t.maxOccupancy ?? t.baseOccupancy} คน
                    </span>
                  </span>
                </span>
                <span className="text-right text-sm">{t.priceSatang === null ? (t.priceNote ?? "ยังไม่มีราคา") : `฿${moneyTh(t.priceSatang)} / ${nights} คืน`}</span>
              </label>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span>จำนวนห้อง</span>
            <input type="number" min={1} max={maxRooms} value={rooms} onChange={(e) => setRooms(Math.min(maxRooms, Math.max(1, Number(e.target.value) || 1)))} className={INPUT} />
          </label>
          <div className="flex justify-end">
            <button type="button" className={BTN_PRIMARY} disabled={!type || type.available < rooms || nights < 1 || datesChanged} onClick={() => setStep(2)}>
              ถัดไป
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className={CARD}>
          <label className="flex flex-col gap-1 text-sm">
            <span>ชื่อผู้เข้าพัก</span>
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={120} className={INPUT} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span>เบอร์โทร</span>
              <input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} maxLength={32} inputMode="tel" className={INPUT} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>อีเมล</span>
              <input value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} maxLength={120} inputMode="email" className={INPUT} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>ผู้ใหญ่ต่อห้อง</span>
              <input type="number" min={1} max={20} value={adults} onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>เด็กต่อห้อง</span>
              <input type="number" min={0} max={20} value={children} onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))} className={INPUT} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>แผนราคา</span>
              <select value={ratePlanId} onChange={(e) => setRatePlanId(e.target.value)} className={INPUT}>
                {model.plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>แหล่งที่มา</span>
              <select value={source} onChange={(e) => setSource(e.target.value)} className={INPUT}>
                {COUNTER_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_TH[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {source === "OTA" ? (
            <label className="flex flex-col gap-1 text-sm">
              <span>เลขการจองของช่องทาง</span>
              <input value={channelRef} onChange={(e) => setChannelRef(e.target.value)} maxLength={64} className={INPUT} />
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            <span>หมายเหตุ</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={INPUT} />
          </label>
          <div className="flex justify-between">
            <button type="button" className={BTN} onClick={() => setStep(1)}>
              ย้อนกลับ
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={!guestName.trim() || (source === "OTA" && !channelRef.trim())} onClick={() => setStep(3)}>
              ถัดไป
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className={CARD}>
          <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
            <dt className="text-[color:var(--color-muted)]">ห้อง</dt>
            <dd>
              {type?.name ?? "—"} · {rooms} ห้อง
            </dd>
            <dt className="text-[color:var(--color-muted)]">วันพัก</dt>
            <dd>{stayTh(checkIn, checkOut)}</dd>
            <dt className="text-[color:var(--color-muted)]">ราคารวมโดยประมาณ</dt>
            <dd>{type?.priceSatang === null || !type ? "คิดตอนยืนยัน" : `฿${moneyTh(type.priceSatang * rooms)}`}</dd>
            <dt className="text-[color:var(--color-muted)]">ผู้เข้าพัก</dt>
            <dd>{guestName.trim() || "ยังไม่ได้กรอก"}</dd>
          </dl>
          {!guestName.trim() ? (
            <label className="flex flex-col gap-1 text-sm">
              <span>ชื่อผู้เข้าพัก</span>
              <input value={guestName} onChange={(e) => setGuestName(e.target.value)} maxLength={120} className={INPUT} />
            </label>
          ) : null}
          <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <legend className="mb-1 text-sm font-medium">รับมัดจำ</legend>
            {DEPOSIT_CHOICES.map((c) => (
              <label key={c.value} data-deposit-choice={c.value} className={`${BTN} cursor-pointer ${depositChoice === c.value ? "border-[color:var(--color-accent)] font-bold" : ""}`}>
                <input type="radio" name="depositChoice" value={c.value} checked={depositChoice === c.value} onChange={() => setDepositChoice(c.value)} className="sr-only" />
                {c.labelTh}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-[color:var(--color-muted)]">รอโอน = ถือห้องไว้ตามเวลาที่ร้านตั้ง แล้วรับมัดจำภายหลังที่หน้ารายละเอียด · ยอดมัดจำคิดตามแผนราคาตอนยืนยัน</p>
          {error ? (
            <p role="alert" className="text-sm text-[color:var(--color-danger)]">
              {error}
            </p>
          ) : null}
          <div className="flex justify-between">
            <button type="button" className={BTN} onClick={() => setStep(2)} disabled={busy}>
              ย้อนกลับ
            </button>
            <button type="button" data-confirm-booking="" className={BTN_PRIMARY} disabled={busy || !guestName.trim()} onClick={submit}>
              {busy ? "กำลังจอง…" : "ยืนยันการจอง"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
