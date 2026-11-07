"use client";
// SVC H.4 ▸ การ์ดเช็กอิน (ภาพ 09 ครึ่งซ้าย · ใบสั่ง h.4 §4) — ก่อนเข้าพัก: เลือกห้อง + สแกนพาสปอร์ต/กรอกทะเบียนผู้พัก (ร.ร.3) + ผูกสมาชิก (ยินยอม) → เช็กอิน
//   หลังเข้าพัก: ✓ ร.ร.3 แขกลงชื่อบนแท็บเล็ต · ✓ ตม.30 ภายใน 24 ชม. (ไฟล์ + เลขรับแจ้ง) · ✓ เงินประกันห้อง (ขั้นแยก) · ✓ ห้อง/แม่บ้าน · เพิ่มผู้พักร่วม
//   ปุ่มทุกปุ่มอยู่ใต้สิทธิ์จากเซิร์ฟเวอร์ (perms) · เลขเอกสารบนจอ = 4 ตัวท้าย · «ดูเลขเต็ม» เฉพาะ canViewId (revealGuestIdAction · ไม่เก็บใน props · ซ่อนเองใน 30 วิ)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { checkInV2Action, revealGuestIdAction, signRr3Action, undoCheckInAction, upsertGuestAction } from "@/lib/modules/hotel/actions";
import GuestForm from "./GuestForm";
import IdScanButton from "./IdScanButton";
import RoomPicker from "./RoomPicker";
import SecurityDepositStep from "./SecurityDepositStep";
import SignaturePad from "./SignaturePad";
import Tm30FileDialog from "./Tm30FileDialog";
import {
  CHECKIN_STEPS,
  emptyGuestForm,
  guestPayload,
  maskLast4,
  nationalityText,
  dateTimeTh,
  dateShortTh,
  type ActionRunner,
  type AfterAction,
  type AssignableRoom,
  type CheckinPerms,
  type CheckinPrimaryCard,
  type CheckinReservation,
  type CheckinSettings,
  type GuestDto,
  type GuestFormValue,
  type IdProposal,
} from "./checkin-shared";

type Props = {
  unitSlug: string;
  reservation: CheckinReservation;
  rooms: AssignableRoom[];
  guests: GuestDto[];
  perms: CheckinPerms;
  settings: CheckinSettings;
  primaryCard: CheckinPrimaryCard;
  nowMs: number;
};
type Notice = { tone: "ok" | "err"; text: string } | null;

const CARD = "flex min-w-0 flex-col gap-4 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4 sm:p-6";
const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg border border-[color:var(--color-line)] px-3 text-sm disabled:opacity-50";
const BTN_PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-lg bg-[color:var(--color-ink)] px-4 text-sm font-bold text-white disabled:opacity-50";
const INPUT = "min-h-11 w-full min-w-0 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 text-sm";

function Check({ done }: { done: boolean }) {
  return (
    <span aria-hidden className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-[color:var(--color-ink)] text-white" : "border border-[color:var(--color-line)] text-[color:var(--color-muted)]"}`}>
      {done ? "✓" : "·"}
    </span>
  );
}

function applyProposal(v: GuestFormValue, p: IdProposal, dataUrl: string): GuestFormValue {
  return {
    ...v,
    fullName: p.fullName ?? v.fullName,
    nationality: p.nationality ?? v.nationality,
    idType: p.docType ?? v.idType,
    idNo: p["idNumber"] ?? v.idNo,
    dob: p.dob ?? v.dob,
    docExpiry: p.expiry ?? v.docExpiry,
    sex: p.sex ?? v.sex,
    imageDataUrl: dataUrl,
    aiProposed: true,
    confirmed: false,
  };
}

export default function CheckinPanel({ unitSlug, reservation: rv, rooms, guests, perms, settings, primaryCard, nowMs }: Props) {
  const router = useRouter();
  const pre = rv.status === "CONFIRMED" || rv.status === "BOOKED";
  const inHouse = rv.status === "CHECKED_IN";
  const firstSellable = rooms.find((r) => r.sellable)?.roomId ?? "";
  const heldOk = rooms.some((r) => r.roomId === rv.roomId && r.sellable);
  const [roomId, setRoomId] = useState(heldOk && rv.roomId ? rv.roomId : firstSellable || rv.roomId || "");
  const [forms, setForms] = useState(guests.length ? ([] as GuestFormValue[]) : [emptyGuestForm(settings.keepIdImageDefault, false)]);
  const [companion, setCompanion] = useState(null as GuestFormValue | null);
  const [forceReason, setForceReason] = useState("");
  const [earlyReason, setEarlyReason] = useState("");
  const [occReason, setOccReason] = useState("");
  const [optIn, setOptIn] = useState({ on: false, phone: "", email: "", marketing: false });
  const [undoReason, setUndoReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null as Notice);
  const [shown, setShown] = useState({ id: "", value: "" });

  const primary = guests[0] ?? null;
  const companions = guests.slice(1);
  const pickedRoom = rooms.find((r) => r.roomId === roomId) ?? null;
  const needForce = pickedRoom !== null && !pickedRoom.sellable;
  const early = rv.checkIn.localeCompare(rv.today) === 1;
  const totalGuests = guests.length + forms.length;
  const signedAll = guests.length !== 0 && guests.every((g) => g.signed);
  const foreign = guests.filter((g) => g.isForeigner);
  const tm30Open = foreign.filter((g) => g.tm30Status === "PENDING" || g.tm30Status === "LATE");
  const tm30Filed = foreign.filter((g) => g.tm30Status === "FILED");
  const roomHk = rooms.find((r) => r.roomId === rv.roomId)?.hkStatus ?? null;
  const lastStep = [primary?.rr3SignedAt, ...tm30Filed.map((g) => g.tm30FiledAt)].filter((x): x is string => typeof x === "string").sort().pop() ?? null;
  const minutes = rv.checkedInAt && lastStep ? Math.max(1, Math.round((Date.parse(lastStep) - Date.parse(rv.checkedInAt)) / 60_000)) : null;
  const done = inHouse && signedAll && tm30Open.length === 0;

  async function run(fn: ActionRunner, okText: string, after?: AfterAction) {
    setBusy(true);
    setNotice(null);
    try {
      const r = await fn();
      if (!r.ok) {
        setNotice({ tone: "err", text: r.reason ?? "ทำรายการไม่สำเร็จ" });
        return;
      }
      setNotice({ tone: "ok", text: okText });
      after?.(r);
      router.refresh();
    } catch {
      setNotice({ tone: "err", text: "ระบบไม่ว่าง ลองใหม่อีกครั้ง" });
    } finally {
      setBusy(false);
    }
  }
  function doCheckIn() {
    const input: Record<string, unknown> = { reservationId: rv.id, roomId, guests: forms.map(guestPayload) };
    if (needForce) input.force = { reason: forceReason };
    if (early) input.earlyOverride = { reason: earlyReason };
    if (occReason.trim()) input.occupancyOverride = { reason: occReason };
    if (optIn.on) input.memberOptIn = { phone: optIn.phone || undefined, email: optIn.email || undefined, consents: optIn.marketing ? ["marketing"] : [] };
    void run(() => checkInV2Action(unitSlug, input), "เช็กอินแล้ว", (r) => {
      const notes: string[] = [];
      if (r.needsDeposit === true) notes.push("ยังไม่ได้รับมัดจำ — รับที่ปุ่ม «รับมัดจำ» ก่อนให้กุญแจ");
      if (r.needsSecurityDeposit === true) notes.push("ยังไม่รับเงินประกันห้อง");
      if (typeof r.tm30DueAt === "string") notes.push(`แจ้ง ตม.30 ภายใน ${dateTimeTh(r.tm30DueAt)}`);
      setNotice({ tone: "ok", text: ["เช็กอินแล้ว", ...notes].join(" · ") });
    });
  }
  function reveal(guestId: string) {
    void run(() => revealGuestIdAction(unitSlug, { guestId }), "แสดงเลขเต็มแล้ว (บันทึกการเปิดดู)", (r) => {
      const raw = r["idNumber"];
      const value = typeof raw === "string" ? raw : "";
      setShown({ id: guestId, value });
      setTimeout(() => setShown({ id: "", value: "" }), 30_000);
    });
  }
  function sign(guestId: string, png: string) {
    void run(() => signRr3Action(unitSlug, { guestId, signaturePng: { dataUrl: png } }), "บันทึกลายมือชื่อ ร.ร.3 แล้ว");
  }
  function signPaper(guestId: string) {
    void run(() => signRr3Action(unitSlug, { guestId, method: "PAPER", note: "ลงชื่อบนกระดาษแล้ว" }), "บันทึกว่าลงชื่อบนกระดาษแล้ว");
  }
  function saveCompanion() {
    if (!companion) return;
    void run(() => upsertGuestAction(unitSlug, { reservationId: rv.id, guest: guestPayload(companion) }), "เพิ่มผู้พักร่วมแล้ว", () => setCompanion(null));
  }
  function undo() {
    void run(() => undoCheckInAction(unitSlug, { reservationId: rv.id, reason: undoReason }), "ย้อนการเช็กอินแล้ว");
  }
  function setForm(i: number, v: GuestFormValue) {
    setForms(
      forms.map((f, k) => {
        return k === i ? v : f;
      }),
    );
  }

  return (
    <section data-checkin-panel={rv.status} className={CARD}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">
          {inHouse || rv.status === "CHECKED_OUT" ? `เช็กอิน · ${dateTimeTh(rv.checkedInAt)}${primaryCard?.recordedByName ? ` · ${primaryCard.recordedByName}` : ""}` : `เช็กอิน · ${dateShortTh(rv.checkIn)}`}
        </h2>
        {done && minutes !== null ? <span className="rounded-full border border-[color:var(--color-ink)] px-3 py-1 text-xs font-bold">เสร็จ {minutes} นาที</span> : null}
      </header>

      {notice ? (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${notice.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
          {notice.text}
        </p>
      ) : null}

      {primary ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[9rem_1fr]">
          <div className="flex h-28 items-center justify-center rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] text-xs text-[color:var(--color-muted)]">
            {primary.hasIdImage ? "มีสำเนารูปเอกสาร" : CHECKIN_STEPS.scan}
          </div>
          <dl className="grid min-w-0 grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-[color:var(--color-muted)]">ชื่อ</dt>
            <dd className="font-bold">{primary.fullName}</dd>
            <dt className="text-[color:var(--color-muted)]">สัญชาติ</dt>
            <dd className="font-bold">{nationalityText(primary.nationality, primary.nationalityTh)}</dd>
            <dt className="text-[color:var(--color-muted)]">{primary.idType === "THAI_ID" ? "บัตรประชาชน" : "พาสปอร์ต"}</dt>
            <dd className="flex flex-wrap items-center gap-2 font-bold">
              <span data-id-masked="">{shown.id === primary.id ? shown.value : maskLast4(primary.idNumberLast4)}</span>
              {perms.canViewId && shown.id !== primary.id && !primary.purged ? (
                <button type="button" className="text-xs font-normal text-[color:var(--color-accent)]" disabled={busy} onClick={() => reveal(primary.id)}>
                  ดูเลขเต็ม
                </button>
              ) : null}
            </dd>
            <dt className="text-[color:var(--color-muted)]">มาจาก / ไปต่อ</dt>
            <dd className="font-bold">
              {primary.arrivedFrom ?? "—"} → {primary.nextDestination ?? "—"}
            </dd>
            <dt className="text-[color:var(--color-muted)]">ผู้พักร่วม</dt>
            <dd className="flex flex-col font-bold">
              {companions.length === 0 ? "—" : null}
              {companions.map((g) => (
                <span key={g.id} className="flex flex-wrap items-center gap-2">
                  {g.fullName} ({g.nationality ?? "—"}) · {shown.id === g.id ? shown.value : maskLast4(g.idNumberLast4)}
                  {perms.canViewId && shown.id !== g.id && !g.purged ? (
                    <button type="button" className="text-xs font-normal text-[color:var(--color-accent)]" disabled={busy} onClick={() => reveal(g.id)}>
                      ดูเลขเต็ม
                    </button>
                  ) : null}
                </span>
              ))}
            </dd>
          </dl>
        </div>
      ) : null}

      {pre && perms.checkIn ? (
        <div data-checkin-form="" className="flex min-w-0 flex-col gap-4">
          <RoomPicker rooms={rooms} value={roomId} onChange={setRoomId} canForce={perms.manage} currentRoomId={rv.roomId} />
          {forms.map((f, i) => (
            <div key={i} className="flex min-w-0 flex-col gap-2">
              <IdScanButton
                unitSlug={unitSlug}
                aiEnabled={settings.aiIdReader}
                onProposal={(p, url) => setForm(i, applyProposal(f, p, url))}
                onImage={(url) => setForm(i, { ...f, imageDataUrl: url })}
              />
              <GuestForm value={f} onChange={(v) => setForm(i, v)} title={i === 0 && guests.length === 0 ? "ผู้เข้าพักหลัก (ร.ร.3)" : `ผู้พักร่วม ${i + (guests.length === 0 ? 0 : 1)}`} />
              {i !== 0 || guests.length !== 0 ? (
                <button type="button" className="self-start text-xs text-[color:var(--color-danger)]" onClick={() => setForms(forms.filter((_, k) => k !== i))}>
                  เอาออก
                </button>
              ) : null}
            </div>
          ))}
          <button type="button" className={`${BTN} self-start`} onClick={() => setForms([...forms, emptyGuestForm(settings.keepIdImageDefault, false)])}>
            + ผู้พักร่วม
          </button>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={optIn.on} onChange={(e) => setOptIn({ ...optIn, on: e.target.checked })} />
            แขกยินยอมสมัคร/ผูกสมาชิก (จากเบอร์โทรหรืออีเมล)
          </label>
          {optIn.on ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input className={INPUT} inputMode="tel" placeholder="เบอร์โทร" value={optIn.phone} onChange={(e) => setOptIn({ ...optIn, phone: e.target.value })} />
              <input className={INPUT} inputMode="email" placeholder="อีเมล" value={optIn.email} onChange={(e) => setOptIn({ ...optIn, email: e.target.value })} />
              <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={optIn.marketing} onChange={(e) => setOptIn({ ...optIn, marketing: e.target.checked })} />
                ยินยอมรับข่าวสาร/โปรโมชัน
              </label>
            </div>
          ) : null}
          {needForce && perms.manage ? (
            <input className={INPUT} placeholder="เหตุผลที่ให้เข้าห้องที่ยังไม่พร้อม (ผู้จัดการ)" value={forceReason} onChange={(e) => setForceReason(e.target.value)} />
          ) : null}
          {early ? (
            perms.manage ? (
              <input className={INPUT} placeholder="เหตุผลที่เช็กอินก่อนวันเข้าพัก (ผู้จัดการ)" value={earlyReason} onChange={(e) => setEarlyReason(e.target.value)} />
            ) : (
              <p className="text-sm text-[color:var(--color-danger)]">ยังไม่ถึงวันเข้าพัก — ให้ผู้จัดการเช็กอินก่อนวัน</p>
            )
          ) : null}
          {perms.manage ? (
            <input className={INPUT} placeholder={`ผู้พัก ${totalGuests} คน · เกินจำนวนห้องรับได้ ให้ระบุเหตุผล (ไม่บังคับ)`} value={occReason} onChange={(e) => setOccReason(e.target.value)} />
          ) : null}
          {rv.depositDueSatang ? <p className="text-sm text-amber-700">มัดจำยังไม่จ่าย — เช็กอินได้ แต่ต้องรับมัดจำก่อนให้กุญแจ</p> : null}
          <button type="button" className={BTN_PRIMARY} disabled={busy || !roomId || (needForce && !perms.manage)} onClick={doCheckIn}>
            {busy ? "กำลังเช็กอิน…" : "เช็กอิน + บันทึกทะเบียนผู้พัก"}
          </button>
        </div>
      ) : null}

      {!pre && guests.length !== 0 ? (
        <ol data-checkin-steps="" className="flex min-w-0 flex-col divide-y divide-[color:var(--color-line)] rounded-xl border border-[color:var(--color-line)]">
          <li className="flex min-w-0 items-start gap-3 p-4">
            <Check done={signedAll} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="text-sm font-bold">{CHECKIN_STEPS.rr3}</span>
              <span className="text-xs text-[color:var(--color-muted)]">{CHECKIN_STEPS.rr3Help}</span>
              {!signedAll && primary && perms.register && inHouse ? (
                settings.rr3OnScreen ? (
                  <SignaturePad busy={busy} onSave={(png) => sign(primary.id, png)} label="แขกลงชื่อบนแท็บเล็ต (ลงแทนห้องได้)" />
                ) : (
                  <button type="button" className={`${BTN} self-start`} disabled={busy} onClick={() => signPaper(primary.id)}>
                    พิมพ์ ร.ร.3 ให้ลงชื่อแล้ว — ติ๊กว่าลงชื่อบนกระดาษแล้ว
                  </button>
                )
              ) : null}
              {primary ? (
                <a className="text-xs font-bold text-[color:var(--color-accent)]" href={`/app/u/${unitSlug}/hotel/guests/${primary.id}/rr3/print`}>
                  พิมพ์บัตร ร.ร.3 →
                </a>
              ) : null}
            </div>
          </li>
          {settings.tm30Enabled && foreign.length !== 0 ? (
            <li className="flex min-w-0 items-start gap-3 p-4">
              <Check done={tm30Open.length === 0} />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-sm font-bold">{CHECKIN_STEPS.tm30}</span>
                <span className="text-xs text-[color:var(--color-muted)]">
                  ระบบเตรียมข้อมูล {foreign.length} คน
                  {tm30Filed.length !== 0 ? ` · ส่งเข้าเว็บ ตม. เมื่อ ${dateTimeTh(tm30Filed[0]?.tm30FiledAt)} · เลขรับแจ้งแนบแล้ว (${tm30Filed[0]?.tm30Ref ?? ""})` : ""}
                  {tm30Open.length !== 0 ? ` · ยังไม่แจ้ง ${tm30Open.length} คน (ภายใน 24 ชม.)` : ""}
                </span>
                {tm30Open.length !== 0 && perms.register ? <Tm30FileDialog unitSlug={unitSlug} guestIds={tm30Open.map((g) => g.id)} canFile compact /> : null}
              </div>
            </li>
          ) : null}
          {settings.securityDeposit.required || rv.securityDepositSatang ? (
            <li className="p-4">
              <SecurityDepositStep
                required={settings.securityDeposit.required}
                amountSatang={settings.securityDeposit.amountSatang}
                heldSatang={rv.securityDepositSatang}
                moneyHref={`/app/u/${unitSlug}/hotel/reservations/${rv.id}?tab=money`}
                checkedIn={inHouse}
              />
            </li>
          ) : null}
          <li className="flex min-w-0 items-start gap-3 p-4">
            <Check done={inHouse || rv.status === "CHECKED_OUT"} />
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-bold">
                ห้อง {rv.roomNumber ?? "—"} · {rv.roomTypeName}
                {roomHk ? ` · แม่บ้าน "${roomHk === "INSPECTED" ? "ตรวจแล้ว" : roomHk === "CLEAN" ? "สะอาด" : roomHk === "DIRTY" ? "รอทำความสะอาด" : "ปิดซ่อม"}"` : ""}
              </span>
              <span className="text-xs text-[color:var(--color-muted)]">
                ผู้พัก {guests.length} คน · ออก {dateShortTh(rv.checkOut)} ก่อนเวลาเช็กเอาต์
              </span>
            </div>
          </li>
        </ol>
      ) : null}

      {inHouse && perms.register ? (
        companion ? (
          <div className="flex min-w-0 flex-col gap-2">
            <IdScanButton unitSlug={unitSlug} aiEnabled={settings.aiIdReader} onProposal={(p, url) => setCompanion(applyProposal(companion, p, url))} onImage={(url) => setCompanion({ ...companion, imageDataUrl: url })} />
            <GuestForm value={companion} onChange={setCompanion} title="ผู้พักร่วม (เพิ่มระหว่างพัก)" />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={saveCompanion}>
                บันทึกผู้พักร่วม
              </button>
              <button type="button" className={BTN} onClick={() => setCompanion(null)}>
                ยกเลิก
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={`${BTN} self-start`} onClick={() => setCompanion(emptyGuestForm(settings.keepIdImageDefault, false))}>
            + เพิ่มผู้พักร่วม
          </button>
        )
      ) : null}

      {inHouse && perms.isManager && perms.manage && rv.checkedInAt && rv.checkedInAt.slice(0, 10) <= rv.today ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-[color:var(--color-muted)]">ย้อนการเช็กอิน (ผู้จัดการ · ภายในวัน)</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <input className={INPUT} placeholder="เหตุผลที่ย้อน" value={undoReason} onChange={(e) => setUndoReason(e.target.value)} />
            <button type="button" className={BTN} disabled={busy || undoReason.trim().length === 0} onClick={undo}>
              ย้อนการเช็กอิน
            </button>
          </div>
        </details>
      ) : null}
    </section>
  );
}
