"use client";

// ShiftsClient.tsx — POS P1.9 จอกะขั้นต่ำ (ภาพ 07 + 13A ส่วน A): เปิดกะของเครื่องนี้ · X · เงินเข้า/ออก · ปิดกะ + Z · ประวัติ · เงินสดนอกกะ
// 🔴 เงินเป็นสตางค์ Int ทุกที่ (ช่องกรอกเป็นบาท → ×100 ปัดครึ่งขึ้น) · คำปฏิเสธแสดงผ่าน refusalMessageKey (ไม่แสดง message ไทยของเซิร์ฟเวอร์)
// 🔴 ยังไม่มี: นับตามธนบัตร · ยอดนับของบัตร/พร้อมเพย์ · PIN/สลับพนักงาน (P1.15/P3.5) · ตั้งค่า pos.shift.* (P1.18) — ฝั่งเซิร์ฟเวอร์รองรับแล้ว

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MoneyText } from "@/components/ui/MoneyText";
import { getPosDeviceId } from "@/lib/modules/pos/device-id";
import { refusalMessageKey } from "@/lib/modules/pos/register-shared";
import type { ShiftReport, ShiftView } from "@/lib/modules/pos/shift";
import {
  closeShiftAction,
  currentShiftAction,
  listShiftsAction,
  offShiftCashAction,
  openShiftAction,
  recordCashMovementAction,
  xReportAction,
  zReportAction,
} from "@/lib/modules/pos/shift-actions";

type Unit = { id: string; name: string };
type Props = { systemId: string; units: Unit[]; unitId: string; canManage: boolean };

/** "1,234.50" → 123450 · ว่าง/ผิดรูป/ติดลบ = null */
function bahtToSatang(v: string): number | null {
  const t = v.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [b, s = ""] = t.split(".");
  return Number(b) * 100 + Number((s + "00").slice(0, 2));
}
const newKey = () => `shift-${(crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "")}`;

function Report({ r, t }: { r: ShiftReport; t: (key: string, values?: Record<string, number>) => string }) {
  const row = (label: string, v: number | null | undefined) => (
    <div className="flex justify-between border-b py-1.5 text-sm last:border-0">
      <span className="text-[color:var(--color-muted)]">{label}</span>
      <span className="tabular-nums">{v === null || v === undefined ? t("hidden") : <MoneyText satang={v} decimals />}</span>
    </div>
  );
  return (
    <div className="rounded-xl border p-3">
      <div className="mb-2 text-sm font-semibold">
        {r.zNumber ? t("zNo", { no: r.zNumber }) : t("xReport")} · {t("shiftNo", { no: r.shiftNo })}
        {r.forced ? ` · ${t("forced")}` : ""}
      </div>
      {row(t("float"), r.floatSatang)}
      <div className="flex justify-between border-b py-1.5 text-sm">
        <span className="text-[color:var(--color-muted)]">{t("bills")}</span>
        <span className="tabular-nums">
          {r.billCount} · <MoneyText satang={r.salesTotalSatang} decimals />
        </span>
      </div>
      <div className="flex justify-between border-b py-1.5 text-sm">
        <span className="text-[color:var(--color-muted)]">{t("voids")}</span>
        <span className="tabular-nums">
          {r.voidCount} · <MoneyText satang={r.voidTotalSatang} decimals />
        </span>
      </div>
      {r.byMethod.map((m) => (
        <div key={m.type} className="flex justify-between border-b py-1.5 text-sm">
          <span className="text-[color:var(--color-muted)]">
            {m.type} ({m.count})
          </span>
          <span className="tabular-nums">
            <MoneyText satang={m.amountSatang} decimals />
          </span>
        </div>
      ))}
      {row(t("tendered"), r.cashTenderedSatang)}
      {row(t("change"), r.changeSatang)}
      {row(t("tip"), r.tipSatang)}
      {row(t("cashIn"), r.cashInSatang)}
      {row(t("cashOut"), r.cashOutSatang)}
      {row(t("expected"), r.expectedCashSatang)}
      {r.zNumber ? row(t("counted"), r.countedCashSatang) : null}
      {r.zNumber ? row(t("overShort"), r.overShortSatang) : null}
    </div>
  );
}

export function ShiftsClient({ systemId, units, unitId, canManage }: Props) {
  const t = useTranslations("pos.shift");
  const te = useTranslations("pos.register");
  const router = useRouter();
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);
  const [shift, setShift] = useState<ShiftView | null>(null);
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [history, setHistory] = useState<ShiftView[]>([]);
  const [viewZ, setViewZ] = useState<ShiftReport | null>(null);
  const [offShift, setOffShift] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // ช่องกรอก
  const [floatB, setFloatB] = useState("0");
  const [label, setLabel] = useState("");
  const [moveB, setMoveB] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [countB, setCountB] = useState("");
  const [note, setNote] = useState("");
  const [closeKey, setCloseKey] = useState(newKey);

  const base = { systemId, unitId, ...(deviceId ? { deviceId } : {}) };
  const fail = useCallback((r: { code: string }) => setError(te(refusalMessageKey(r.code))), [te]);

  const load = useCallback(
    async (dev: string | undefined) => {
      setError(null);
      const b = { systemId, unitId, ...(dev ? { deviceId: dev } : {}) };
      const [cur, list, off] = await Promise.all([
        dev ? currentShiftAction({ ...b, deviceId: dev }) : Promise.resolve(null),
        listShiftsAction({ systemId, unitId, limit: 30 }),
        canManage ? offShiftCashAction({ systemId, unitId }) : Promise.resolve(null),
      ]);
      const s = cur && cur.ok ? cur.shift : null;
      setShift(s);
      if (list.ok) setHistory(list.items);
      if (off && off.ok) setOffShift(off.totalSatang);
      if (s) {
        const x = await xReportAction({ ...b, shiftId: s.id }); // R2 F3: ส่ง deviceId — แคชเชียร์เห็น X ของกะเปิดที่เครื่องนี้
        setReport(x.ok ? x.report : null);
      } else setReport(null);
      setLoaded(true);
    },
    [systemId, unitId, canManage],
  );

  useEffect(() => {
    const dev = getPosDeviceId();
    setDeviceId(dev);
    void load(dev);
  }, [load]);

  const run = async (fn: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (await fn()) await load(deviceId);
    } catch {
      setError(te("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  const doOpen = () =>
    run(async () => {
      const f = bahtToSatang(floatB);
      if (f === null || !deviceId) {
        setError(te("errors.invalidLine"));
        return false;
      }
      const r = await openShiftAction({ ...base, shift: { deviceId, floatSatang: f, ...(label.trim() ? { deviceLabel: label.trim() } : {}) } });
      // R2 F2: ถูกปฏิเสธ = คืน false (ไม่ load ซ้ำ ข้อความผิดพลาดค้างบนจอ) · true เฉพาะสำเร็จ / มีกะเปิดอยู่แล้ว
      if (!r.ok && r.code !== "SHIFT_ALREADY_OPEN") {
        fail(r);
        return false;
      }
      return true;
    });
  const doMove = (kind: "IN" | "OUT") =>
    run(async () => {
      const a = bahtToSatang(moveB);
      if (!shift || a === null || a <= 0 || !moveReason.trim()) {
        setError(te("errors.invalidLine"));
        return false;
      }
      const r = await recordCashMovementAction({ ...base, movement: { shiftId: shift.id, kind, amountSatang: a, reason: moveReason.trim(), idempotencyKey: newKey() } });
      if (!r.ok) {
        fail(r);
        return false;
      }
      setMoveB("");
      setMoveReason("");
      return true;
    });
  const doClose = () =>
    run(async () => {
      const c = bahtToSatang(countB);
      if (!shift || c === null) {
        setError(te("errors.invalidLine"));
        return false;
      }
      const r = await closeShiftAction({ ...base, close: { shiftId: shift.id, countedCashSatang: c, ...(note.trim() ? { note: note.trim() } : {}), idempotencyKey: closeKey } });
      if (!r.ok) {
        fail(r);
        return false;
      }
      setViewZ(r.report);
      setCountB("");
      setNote("");
      setCloseKey(newKey());
      return true;
    });
  const showZ = (id: string) =>
    run(async () => {
      const r = await zReportAction({ ...base, shiftId: id });
      if (r.ok) setViewZ(r.report);
      else fail(r);
      return false;
    });

  const statusText = (s: string) => (s === "OPEN" ? t("statusOpen") : s === "FORCE_CLOSED" ? t("statusForced") : t("statusClosed"));

  return (
    <div className="flex flex-col gap-5" data-testid="pos-shifts">
      {units.length > 1 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[color:var(--color-muted)]">{t("unit")}</span>
          <select data-testid="pos-shift-unit" className="input min-h-[44px]" value={unitId} onChange={(e) => router.push(`/app/sys/${systemId}/pos/shifts?unit=${encodeURIComponent(e.target.value)}`)}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]">
          {error}
        </div>
      )}
      {!loaded ? (
        <p className="text-sm text-[color:var(--color-muted)]">{t("loading")}</p>
      ) : !shift ? (
        <section className="flex flex-col gap-3 rounded-xl border p-4" data-testid="pos-shift-open">
          <h2 className="text-base font-semibold">{t("noShift")}</h2>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--color-muted)]">{t("deviceLabel")}</span>
            <input data-testid="pos-shift-open-label" className="input min-h-[44px]" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[color:var(--color-muted)]">{t("float")}</span>
            <input data-testid="pos-shift-open-float" className="input min-h-[44px]" inputMode="decimal" value={floatB} onChange={(e) => setFloatB(e.target.value)} />
          </label>
          <button data-testid="pos-shift-open-submit" type="button" className="btn btn-primary min-h-[44px]" disabled={busy || !deviceId} onClick={doOpen}>
            {t("open")}
          </button>
        </section>
      ) : (
        <section className="flex flex-col gap-4" data-testid="pos-shift-current">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">
              {t("current")} · {t("shiftNo", { no: shift.shiftNo })}
              {shift.deviceLabel ? ` · ${shift.deviceLabel}` : ""}
            </h2>
            <button data-testid="pos-shift-refresh" type="button" className="btn btn-ghost min-h-[44px] text-sm" disabled={busy} onClick={() => run(async () => true)}>
              {t("refresh")}
            </button>
          </div>
          {report && <Report r={report} t={t} />}
          <div className="flex flex-col gap-2 rounded-xl border p-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input data-testid="pos-shift-move-amount" className="input min-h-[44px]" inputMode="decimal" placeholder={t("amount")} value={moveB} onChange={(e) => setMoveB(e.target.value)} />
              <input data-testid="pos-shift-move-reason" className="input min-h-[44px]" maxLength={200} placeholder={t("reason")} value={moveReason} onChange={(e) => setMoveReason(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button data-testid="pos-shift-cash-in" type="button" className="btn btn-ghost min-h-[44px] flex-1" disabled={busy} onClick={() => doMove("IN")}>
                {t("cashIn")}
              </button>
              <button data-testid="pos-shift-cash-out" type="button" className="btn btn-ghost min-h-[44px] flex-1" disabled={busy} onClick={() => doMove("OUT")}>
                {t("cashOut")}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-xl border p-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[color:var(--color-muted)]">{t("counted")}</span>
              <input data-testid="pos-shift-close-counted" className="input min-h-[44px]" inputMode="decimal" value={countB} onChange={(e) => setCountB(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[color:var(--color-muted)]">{t("reason")}</span>
              <input data-testid="pos-shift-close-note" className="input min-h-[44px]" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button data-testid="pos-shift-close-submit" type="button" className="btn btn-primary min-h-[44px]" disabled={busy} onClick={doClose}>
              {t("close")}
            </button>
          </div>
        </section>
      )}

      {viewZ && (
        <section className="flex flex-col gap-2" data-testid="pos-shift-z">
          <h2 className="text-base font-semibold">{t("zReport")}</h2>
          <Report r={viewZ} t={t} />
        </section>
      )}

      {canManage && offShift !== null && (
        <div className="flex justify-between rounded-xl border p-3 text-sm">
          <span className="text-[color:var(--color-muted)]">{t("offShift")}</span>
          <MoneyText satang={offShift} decimals />
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">{t("history")}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">{t("empty")}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm last:border-0">
                <span className="min-w-0 truncate">
                  {t("shiftNo", { no: h.shiftNo })}
                  {h.deviceLabel ? ` · ${h.deviceLabel}` : ""} · {statusText(h.status)}
                  {h.zNumber ? ` · ${t("zNo", { no: h.zNumber })}` : ""}
                  {h.overShortSatang !== null && h.overShortSatang !== 0 ? (
                    <>
                      {" "}
                      · {t("overShort")} <MoneyText satang={h.overShortSatang} decimals />
                    </>
                  ) : null}
                </span>
                {h.zNumber ? (
                  <button data-testid={`pos-shift-z-view-${h.zNumber}`} type="button" className="btn btn-ghost min-h-[44px] text-sm" disabled={busy} onClick={() => showZ(h.id)}>
                    {t("view")}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
