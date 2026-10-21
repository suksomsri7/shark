"use client";

// OfflineQueueSection.tsx — "บิลออฟไลน์รอผู้จัดการ" บนหน้ากะ (POS P3.4U · มติผู้คุม 9 · CD-P34U-4 · hunter N10)
// POS P3.4U ▸ ไฟล์ใหม่ทั้งไฟล์ ◂
//   ไม่มีหน้าใหม่ (qc-hf-pos-page-authz นับเท่าเดิม) · แถวจาก listOfflineRejectedAction (pos.shift.manage) — เลข OFF · เวลาขาย (อ่านหลัง mount) ·
//   เหตุผล (offlineRefusalMessageKey) · ผู้ขายที่เครื่องอ้าง vs ที่ตรวจแล้ว · ยอด · รับบิล / ทิ้งบิล (เหตุผล ≥ 5 ตัวอักษร) · คำปฏิเสธแสดงในแถว ·
//   N10: แถว SHIFT_CLOSED ที่ซิงก์หลังเวลาขาย = "ซิงก์หลังเครื่องปิดกะ" (จากฟิลด์เดิมเท่านั้น — offlineSyncedAfterClose)
//   ไม่มีภาพออกแบบ ⇒ จออนุพันธ์ (เจ้าของรับทราบ แบบ P2.8) ใช้การ์ด/ปุ่มเดียวกับการ์ดอื่นของหน้ากะ
// 🔴 ไฟล์ "use client": import เฉพาะ *-shared / *-actions · ชนิดข้อมูลมาจาก ReturnType ของ action (ไม่ import ชนิดจากโมดูลเซิร์ฟเวอร์) · ไม่มีข้อความไทยนอก t()
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { OFFLINE_REFUSAL_CODES, offlineRefusalMessageKey } from "@/lib/modules/pos/offline-shared";
import { offlineDiscardReasonOk, offlineSyncedAfterClose } from "@/lib/modules/pos/offline-client-shared";
import { refusalMessageKey } from "@/lib/modules/pos/register-shared";
import { acceptOfflineSaleAction, discardOfflineSaleAction, listOfflineRejectedAction } from "@/lib/modules/pos/offline-actions";
import { CARD, Pill, ShiftIcon, bkkDay, bkkHm, money, type T } from "./shifts-ui";

type ListOk = Extract<Awaited<ReturnType<typeof listOfflineRejectedAction>>, { ok: true }>;
type Row = ListOk["items"][number];
type RowMsg = { key: string; values?: Record<string, string | number>; tone: "danger" | "ok" };

/** รหัสปฏิเสธ → คีย์ใต้ pos.register (รหัสของงานออฟไลน์ = offline.refusal.* · อื่น = errors.*) */
const codeKey = (code: string) => ((OFFLINE_REFUSAL_CODES as readonly string[]).includes(code) ? offlineRefusalMessageKey(code) : refusalMessageKey(code));

export function OfflineQueueSection(p: { systemId: string; unitId: string; enabled: boolean; names: Record<string, string>; locale: string; onChanged?: () => void }) {
  const t = useTranslations("pos.shift") as T;
  const te = useTranslations("pos.register") as T;
  const [items, setItems] = useState<Row[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [discardFor, setDiscardFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [msgs, setMsgs] = useState<Record<string, RowMsg>>({});
  /** เวลาขาย/รับเข้าระบบ อ่านหลัง mount (HF-418 — ไม่มีวันที่ตอนวาดฝั่งเซิร์ฟเวอร์) */
  const [times, setTimes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const r = await listOfflineRejectedAction({ systemId: p.systemId, unitId: p.unitId, limit: 50 }).catch(() => null);
    if (!r) return setLoadErr("errors.unknown");
    if (!r.ok) return setLoadErr(codeKey(r.code));
    setLoadErr(null);
    setItems(r.items);
  }, [p.systemId, p.unitId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setTimes(Object.fromEntries((items ?? []).map((r) => [r.id, `${bkkDay(r.soldAt, p.locale)} ${bkkHm(r.soldAt, p.locale)}`])));
  }, [items, p.locale]);

  const setMsg = (id: string, m: RowMsg | null) =>
    setMsgs((s) => {
      const n = { ...s };
      if (m) n[id] = m;
      else delete n[id];
      return n;
    });
  const accept = async (row: Row) => {
    if (busy) return;
    setBusy(row.id);
    setMsg(row.id, null);
    try {
      const r = await acceptOfflineSaleAction({ systemId: p.systemId, unitId: p.unitId, id: row.id }).catch(() => null);
      if (!r) return setMsg(row.id, { key: "errors.unknown", tone: "danger" });
      if (!r.ok) return setMsg(row.id, { key: codeKey(r.code), tone: "danger" });
      setMsg(row.id, { key: "accepted", values: { no: r.receiptNo ?? "-" }, tone: "ok" });
      await load();
      p.onChanged?.();
    } finally {
      setBusy(null);
    }
  };
  const discard = async (row: Row) => {
    if (busy) return;
    if (!offlineDiscardReasonOk(reason)) return setMsg(row.id, { key: "reasonInvalid", tone: "danger" });
    setBusy(row.id);
    setMsg(row.id, null);
    try {
      const r = await discardOfflineSaleAction({ systemId: p.systemId, unitId: p.unitId, id: row.id, reason: reason.trim() }).catch(() => null);
      if (!r) return setMsg(row.id, { key: "errors.unknown", tone: "danger" });
      if (!r.ok) return setMsg(row.id, { key: codeKey(r.code), tone: "danger" });
      setDiscardFor(null);
      setReason("");
      setMsg(row.id, { key: "discarded", tone: "ok" });
      await load();
      p.onChanged?.();
    } finally {
      setBusy(null);
    }
  };
  // ปิดธง + ไม่มีแถว = ไม่วาดอะไร (หน้ากะแบบวันนี้ทุกพิกเซล) · ข้อความของแถวที่หายไปแล้ว (รับ/ทิ้งสำเร็จ) แสดงท้ายการ์ด
  const doneMsgs = Object.entries(msgs).filter(([id]) => !(items ?? []).some((r) => r.id === id));
  if (!p.enabled && (items === null || items.length === 0) && doneMsgs.length === 0) return null;
  const nameOf = (id: string | null) => (id ? (p.names[id] ?? t("offline.unknownUser")) : t("offline.unknownUser"));
  const msgText = (m: RowMsg) => (m.key.startsWith("offline.refusal.") || m.key.startsWith("errors.") ? te(m.key, m.values) : t(`offline.${m.key}`, m.values));

  return (
    <section className={`${CARD} flex flex-col gap-4`} data-testid="pos-shift-offline-queue" data-count={items?.length ?? 0}>
      <div className="flex items-start gap-2.5">
        <ShiftIcon name="lock" size={18} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[17px] font-bold">{t("offline.title")}</h3>
          <p className="text-[12px] text-[color:var(--color-muted)]">{t("offline.sub")}</p>
        </div>
        {items && items.length > 0 ? <Pill tone="danger">{items.length}</Pill> : null}
      </div>
      {loadErr ? (
        <p role="alert" className="text-[13px] text-[color:var(--color-danger)]">
          {te(loadErr)}
        </p>
      ) : items && items.length === 0 ? (
        <p className="text-[13px] text-[color:var(--color-muted)]">
          {t("offline.empty")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {(items ?? []).map((r) => {
            const m = msgs[r.id];
            const late = offlineSyncedAfterClose(r);
            const claimed = r.claimedSellerUserId;
            const verified = r.verifiedSellerUserId;
            return (
              <li key={r.id} data-testid={`pos-shift-offline-row-${r.id}`} data-reason={r.reason ?? ""} className="flex flex-col gap-2 px-4 py-3 text-[14px]">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <b className="tabular-nums">{r.offlineRef}</b>
                  <span className="text-[12.5px] text-[color:var(--color-muted)] tabular-nums">{times[r.id] ? t("offline.soldAt", { time: times[r.id]! }) : ""}</span>
                  <span className="flex-1" />
                  <b className="tabular-nums">{r.expectedGrandTotalSatang === null ? "—" : money(r.expectedGrandTotalSatang)}</b>
                </div>
                <p className="font-semibold text-[color:var(--color-danger)]">{te(offlineRefusalMessageKey(r.reason ?? ""))}</p>
                {late ? (
                  <p className="text-[12.5px] text-[color:var(--color-ink-soft)]">
                    {t("offline.syncedAfterClose")}
                  </p>
                ) : null}
                <p className="text-[12.5px] text-[color:var(--color-muted)]">
                  {t("offline.sellerClaimed", { name: nameOf(claimed) })} · {t("offline.sellerVerified", { name: nameOf(verified) })}
                  {claimed && verified && claimed !== verified ? <span className="ml-1 font-semibold text-[color:var(--color-danger)]">≠</span> : null}
                </p>
                {discardFor === r.id ? (
                  <div className="flex flex-col gap-2">
                    <label className="flex flex-col gap-1 text-[12.5px] text-[color:var(--color-muted)]">
                      {t("offline.reason")}
                      <input
                        data-testid={`pos-shift-offline-reason-${r.id}`}
                        className="input h-11 rounded-[11px] text-[14px]"
                        maxLength={500}
                        value={reason}
                        disabled={busy === r.id}
                        onChange={(e) => {
                          setReason(e.target.value);
                          if (m?.key === "reasonInvalid") setMsg(r.id, null);
                        }}
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button data-testid={`pos-shift-offline-discard-confirm-${r.id}`} type="button" disabled={!!busy} className="btn btn-primary h-11 rounded-[11px] px-4 text-[14px]" onClick={() => void discard(r)}>
                        {t("offline.confirmDiscard")}
                      </button>
                      <button
                        data-testid={`pos-shift-offline-discard-cancel-${r.id}`}
                        type="button"
                        disabled={busy === r.id}
                        className="btn btn-ghost h-11 rounded-[11px] px-4 text-[14px]"
                        onClick={() => {
                          setDiscardFor(null);
                          setReason("");
                          setMsg(r.id, null);
                        }}
                      >
                        {t("offline.cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button data-testid={`pos-shift-offline-accept-${r.id}`} type="button" disabled={!!busy} className="btn btn-primary h-11 rounded-[11px] px-4 text-[14px]" onClick={() => void accept(r)}>
                      {t("offline.accept")}
                    </button>
                    <button
                      data-testid={`pos-shift-offline-discard-${r.id}`}
                      type="button"
                      disabled={!!busy}
                      className="btn btn-ghost h-11 rounded-[11px] px-4 text-[14px]"
                      onClick={() => {
                        setDiscardFor(r.id);
                        setReason("");
                        setMsg(r.id, null);
                      }}
                    >
                      {t("offline.discard")}
                    </button>
                  </div>
                )}
                {m ? (
                  <p role={m.tone === "danger" ? "alert" : "status"} className={`text-[13px] font-semibold ${m.tone === "danger" ? "text-[color:var(--color-danger)]" : ""}`}>
                    {msgText(m)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {doneMsgs.map(([id, m]) => (
        <p key={id} role="status" className="text-[13px] font-semibold">
          {msgText(m)}
        </p>
      ))}
    </section>
  );
}
