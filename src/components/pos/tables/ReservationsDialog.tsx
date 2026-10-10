"use client";

// ReservationsDialog.tsx — แผ่น "จองโต๊ะวันนี้ N" (POS P2.4U · มติ 7) — รายการจองที่ยังรอ (BOOKED) ของวันนี้ · นั่งโต๊ะ · ยกเลิก · "+ จอง"
//   รายการ = registerReservationsTodayAction (deviation 2 — สัญญา S ให้แค่จำนวน) · นั่ง = registerSeatReservationAction (โต๊ะมีคนอยู่ = tables.errors.occupied) ·
//   ยกเลิก = registerCancelReservationAction (ถามก่อน) · จอง = registerCreateReservationAction (ชื่อ · เบอร์ · จำนวนคน · เวลา · โต๊ะ (ไม่บังคับ) · กันโต๊ะก่อน 15 นาที)
//   🔴 เวลาแสดง/กรอกเป็นเวลาไทยเสมอ · วาดเวลาเฉพาะหลัง mount (ผู้เรียกเปิดแผ่นหลัง mount อยู่แล้ว)

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { refusalMessageKey } from "@/lib/modules/pos/register-shared";
import { RESERVATION_HOLD_DEFAULT_MINUTES, RESERVATION_HOLD_MAX_MINUTES, RESERVATION_PARTY_MAX, type TableCard } from "@/lib/modules/pos/table-shared";
import { registerCancelReservationAction, registerCreateReservationAction, registerSeatReservationAction } from "@/lib/modules/pos/table-actions";
import { registerReservationsTodayAction } from "@/lib/modules/pos/table-ui-actions";
import { RegisterDialog, REG_DIALOG_PANEL, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { bkkClock, bkkDateTimeLocal, bkkLocalToIso } from "./table-ui";

type Row = Extract<Awaited<ReturnType<typeof registerReservationsTodayAction>>, { ok: true }>["reservations"][number];
type Msg = { key: string; ns: "tables" | "register"; values?: Record<string, string | number> };

type Props = {
  systemId: string;
  unitId: string;
  deviceId?: string;
  tables: TableCard[];
  nowMs: number;
  onChanged: (toast: Msg | null, seatedSessionId?: string) => void;
  onClose: () => void;
};

const INPUT = "h-12 w-full rounded-[12px] border bg-[color:var(--color-surface)] px-3 text-[15px] text-[color:var(--color-ink)]";

export function ReservationsDialog(p: Props) {
  const t = useTranslations("pos.tables");
  const tr = useTranslations("pos.register");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<Msg | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [seatPick, setSeatPick] = useState<{ id: string; tableId: string } | null>(null);
  const [f, setF] = useState(() => ({ name: "", phone: "", party: "2", at: bkkDateTimeLocal(p.nowMs + 3_600_000 - (p.nowMs % 1_800_000)), tableId: "", hold: String(RESERVATION_HOLD_DEFAULT_MINUTES) }));
  const target = { systemId: p.systemId, unitId: p.unitId, ...(p.deviceId ? { deviceId: p.deviceId } : {}) };
  const msg = (m: Msg) => (m.ns === "tables" ? t(m.key, m.values) : tr(m.key, m.values));

  const load = async () => {
    try {
      const r = await registerReservationsTodayAction(target);
      if (r.ok) setRows(r.reservations);
      else {
        setRows([]);
        setErr({ key: refusalMessageKey(r.code), ns: "register" });
      }
    } catch {
      setRows([]);
      setErr({ key: "errors.loadFailed", ns: "register" });
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- โหลดครั้งเดียวตอนเปิดแผ่น
  }, []);

  const tableName = (id: string | null) => (id ? (p.tables.find((x) => x.id === id)?.name ?? "-") : t("reservation.anyTable"));
  const seatable = p.tables.filter((x) => x.state === "FREE" || x.state === "RESERVED" || x.state === "NEEDS_CLEARING");

  const seat = async (r: Row, tableId: string | null) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await registerSeatReservationAction({ ...target, reservationId: r.id, ...(tableId ? { tableId } : {}) });
      if (res.ok) {
        const tbl = tableName(tableId ?? r.tableId);
        p.onChanged({ key: "reservation.seated", ns: "tables", values: { table: tbl } }, res.sessionId);
        return;
      }
      // fix-2 F3: โต๊ะมีลูกค้าอยู่ = VALIDATION (ข้อความไทยของเซิร์ฟเวอร์) ⇒ คีย์ tables.errors.occupied
      const occupied = res.code === "VALIDATION" && !!p.tables.find((x) => x.id === (tableId ?? r.tableId) && !!x.sessionId);
      setErr(occupied ? { key: "errors.occupied", ns: "tables" } : { key: refusalMessageKey(res.code), ns: "register" });
    } catch {
      setErr({ key: "errors.unknown", ns: "register" });
    } finally {
      setBusy(false);
      setSeatPick(null);
    }
  };
  const cancel = async (r: Row) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await registerCancelReservationAction({ ...target, reservationId: r.id });
      if (res.ok) {
        setConfirmCancel(null);
        p.onChanged({ key: "reservation.cancelled", ns: "tables" });
        await load();
      } else setErr({ key: refusalMessageKey(res.code), ns: "register" });
    } catch {
      setErr({ key: "errors.unknown", ns: "register" });
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    if (busy) return;
    const at = bkkLocalToIso(f.at);
    const party = Number(f.party);
    const hold = Number(f.hold);
    if (!f.name.trim()) return setErr({ key: "reservation.nameRequired", ns: "tables" });
    if (!at || !Number.isInteger(party) || party < 1 || party > RESERVATION_PARTY_MAX || !Number.isInteger(hold) || hold < 0 || hold > RESERVATION_HOLD_MAX_MINUTES)
      return setErr({ key: "reservation.invalid", ns: "tables" });
    setBusy(true);
    setErr(null);
    try {
      const res = await registerCreateReservationAction({ ...target, name: f.name.trim(), phone: f.phone.trim() || null, partySize: party, at, holdFromMinutes: hold, tableId: f.tableId || null });
      if (res.ok) {
        setForm(false);
        setF((v) => ({ ...v, name: "", phone: "" }));
        p.onChanged({ key: "reservation.created", ns: "tables" });
        await load();
      } else setErr(res.code === "VALIDATION" ? { key: "reservation.invalid", ns: "tables" } : { key: refusalMessageKey(res.code), ns: "register" });
    } catch {
      setErr({ key: "errors.unknown", ns: "register" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <RegisterDialog onDismiss={p.onClose} locked={busy}>
      <div data-testid="pos-tbl-reservations-sheet" role="dialog" aria-modal="true" aria-label={t("reservation.title")} className={`${REG_DIALOG_PANEL} md:w-[520px]`}>
        <SheetGrab />
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-[19px] font-bold">{t("reservation.title")}</h2>
          {!form && (
            <button data-testid="pos-tbl-reservation-add" type="button" className="btn btn-ghost h-11 rounded-[12px] px-3 text-[14px] font-bold" onClick={() => setForm(true)}>
              {t("reservation.add")}
            </button>
          )}
          <button data-testid="pos-tbl-reservations-close" type="button" aria-label={t("reservation.close")} className="grid size-11 place-items-center rounded-[12px] text-[color:var(--color-ink-soft)]" onClick={p.onClose}>
            <RegisterIcon name="x" size={18} />
          </button>
        </div>

        {err && (
          <p data-testid="pos-tbl-reservations-error" role="alert" className="text-[13px] text-[color:var(--color-danger)]">
            {msg(err)}
          </p>
        )}

        {form && (
          <form
            data-testid="pos-tbl-reservation-form"
            className="flex flex-col gap-2.5 rounded-[14px] border p-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <label className="flex flex-col gap-1 text-[12.5px] text-[color:var(--color-ink-soft)]">
              {t("reservation.name")}
              <input data-testid="pos-tbl-reservation-name" className={INPUT} value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[12.5px] text-[color:var(--color-ink-soft)]">
                {t("reservation.phone")}
                <input data-testid="pos-tbl-reservation-phone" className={INPUT} inputMode="tel" value={f.phone} maxLength={20} onChange={(e) => setF({ ...f, phone: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-[12.5px] text-[color:var(--color-ink-soft)]">
                {t("reservation.partySize")}
                <input data-testid="pos-tbl-reservation-party" className={INPUT} inputMode="numeric" value={f.party} onChange={(e) => setF({ ...f, party: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[12.5px] text-[color:var(--color-ink-soft)]">
                {t("reservation.at")}
                <input data-testid="pos-tbl-reservation-at" type="datetime-local" className={INPUT} value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-[12.5px] text-[color:var(--color-ink-soft)]">
                {t("reservation.holdFrom")}
                <input data-testid="pos-tbl-reservation-hold" className={INPUT} inputMode="numeric" value={f.hold} onChange={(e) => setF({ ...f, hold: e.target.value.replace(/\D/g, "").slice(0, 3) })} />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-[12.5px] text-[color:var(--color-ink-soft)]">
              {t("reservation.table")}
              <select data-testid="pos-tbl-reservation-table" className={INPUT} value={f.tableId} onChange={(e) => setF({ ...f, tableId: e.target.value })}>
                <option value="">{t("reservation.anyTable")}</option>
                {p.tables
                  .filter((x) => x.state !== "INACTIVE")
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button data-testid="pos-tbl-reservation-form-cancel" type="button" disabled={busy} className="btn btn-ghost h-12 rounded-[14px]" onClick={() => setForm(false)}>
                {t("panel.back")}
              </button>
              <button data-testid="pos-tbl-reservation-save" type="submit" disabled={busy} className="btn btn-primary h-12 rounded-[14px] font-bold">
                {t("reservation.save")}
              </button>
            </div>
          </form>
        )}

        {rows === null ? (
          <p className="py-6 text-center text-[13.5px] text-[color:var(--color-muted)]">{"…"}</p>
        ) : rows.length === 0 ? (
          <p data-testid="pos-tbl-reservations-empty" className="py-6 text-center text-[13.5px] text-[color:var(--color-muted)]">
            {t("reservation.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.id} data-testid={`pos-tbl-reservation-${r.id}`} className="flex flex-col gap-2 rounded-[14px] border px-3.5 py-3">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14.5px]">{t("reservation.row", { time: bkkClock(r.at), name: r.name, n: r.partySize })}</b>
                    <span className="block truncate text-[12.5px] text-[color:var(--color-muted)]">
                      {[
                        `${t("reservation.table")} ${tableName(r.tableId)}`,
                        t("card.holdFrom", { time: bkkClock(new Date(Date.parse(r.at) - r.holdFromMinutes * 60_000).toISOString()) }),
                        r.phone ?? "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </div>
                {confirmCancel === r.id ? (
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-[13px]">{t("reservation.cancelConfirm", { name: r.name })}</span>
                    <button data-testid={`pos-tbl-reservation-keep-${r.id}`} type="button" disabled={busy} className="btn btn-ghost h-11 rounded-[12px] px-3 text-[13px]" onClick={() => setConfirmCancel(null)}>
                      {t("reservation.keep")}
                    </button>
                    <button
                      data-testid={`pos-tbl-reservation-cancel-confirm-${r.id}`}
                      type="button"
                      disabled={busy}
                      className="btn h-11 rounded-[12px] bg-[color:var(--color-danger)] px-3 text-[13px] font-bold text-white"
                      onClick={() => void cancel(r)}
                    >
                      {t("reservation.cancel")}
                    </button>
                  </div>
                ) : seatPick?.id === r.id ? (
                  <div className="flex items-center gap-2">
                    <select
                      data-testid={`pos-tbl-reservation-seat-table-${r.id}`}
                      className={`${INPUT} flex-1`}
                      value={seatPick.tableId}
                      aria-label={t("reservation.pickTable")}
                      onChange={(e) => setSeatPick({ id: r.id, tableId: e.target.value })}
                    >
                      <option value="">{t("reservation.pickTable")}</option>
                      {seatable.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                    <button
                      data-testid={`pos-tbl-reservation-seat-confirm-${r.id}`}
                      type="button"
                      disabled={busy || !seatPick.tableId}
                      className="btn btn-primary h-12 rounded-[12px] px-4 text-[14px] font-bold"
                      onClick={() => void seat(r, seatPick.tableId)}
                    >
                      {t("reservation.seat")}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-2">
                    <button data-testid={`pos-tbl-reservation-cancel-${r.id}`} type="button" disabled={busy} className="btn btn-ghost h-11 rounded-[12px] px-3 text-[13px]" onClick={() => setConfirmCancel(r.id)}>
                      {t("reservation.cancel")}
                    </button>
                    <button
                      data-testid={`pos-tbl-reservation-seat-${r.id}`}
                      type="button"
                      disabled={busy}
                      className="btn btn-primary h-11 rounded-[12px] px-4 text-[13.5px] font-bold"
                      onClick={() => (r.tableId ? void seat(r, null) : setSeatPick({ id: r.id, tableId: "" }))}
                    >
                      {t("reservation.seat")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </RegisterDialog>
  );
}
