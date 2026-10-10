"use client";

// TableAlerts.tsx — "แจ้งเตือนจากโต๊ะ" (POS P2.4U · ภาพ 03 ขวาล่าง · มติ 8) — registerTableRequestsAction (ดึงพร้อมผังทุก 20 วิ)
//   CALL_STAFF: รับทราบ (ack · ธงยังอยู่) → เสร็จแล้ว (done · ธงหาย) · REQUEST_BILL: "เปิดโต๊ะ" = เลือกโต๊ะนั้น ·
//   PAY_PROMPTPAY: "ยืนยันรับเงิน" = เปิดจอเช็คบิลของโต๊ะนั้นโดยเลือกพร้อมเพย์ไว้แล้ว
//   🔴 นาทีที่ผ่านมาวาดหลัง mount เท่านั้น · ยอดของ REQUEST_BILL มาจากการ์ด (unpaidSatang ของเซิร์ฟเวอร์)

import { useTranslations } from "next-intl";
import { moneyText } from "@/lib/modules/pos/register-shared";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { minutesSince } from "./table-ui";

export type TableRequest = { id: string; type: string; status: string; sessionId: string; tableId: string; tableName: string; note: string | null; createdAt: string; ackedAt: string | null };

type Props = {
  requests: TableRequest[];
  unpaidOf: (tableId: string) => number;
  now: number | null;
  busyId: string | null;
  onAck: (r: TableRequest) => void;
  onDone: (r: TableRequest) => void;
  onOpen: (r: TableRequest) => void;
  onConfirmPay: (r: TableRequest) => void;
  compact?: boolean;
};

export function TableAlerts({ requests, unpaidOf, now, busyId, onAck, onDone, onOpen, onConfirmPay, compact = false }: Props) {
  const t = useTranslations("pos.tables");
  if (!requests.length) return null;
  const btn = "h-11 shrink-0 rounded-[12px] px-3.5 text-[13.5px] font-bold disabled:opacity-50";
  return (
    <section data-testid="pos-tbl-alerts" aria-label={t("alerts.title")} className={compact ? "px-4 pb-3 xl:px-5" : "border-t px-4 pb-4 pt-3"}>
      <h3 className="mb-2 text-[13px] font-bold text-[color:var(--color-ink-soft)]">{t("alerts.title")}</h3>
      <ul className={`flex flex-col gap-2 ${compact ? "md:grid md:grid-cols-2" : ""}`}>
        {requests.map((r) => {
          const mins = now !== null ? t("alerts.minutesAgo", { n: minutesSince(r.createdAt, now) }) : "";
          const call = r.type === "CALL_STAFF";
          const pay = r.type === "PAY_PROMPTPAY";
          const title = call
            ? t("alerts.callStaff", { table: r.tableName })
            : pay
              ? t("alerts.payPromptpay", { table: r.tableName })
              : t("alerts.requestBill", { table: r.tableName, amount: moneyText(unpaidOf(r.tableId)) });
          const busy = busyId === r.id;
          return (
            <li
              key={r.id}
              data-testid={`pos-tbl-alert-${r.id}`}
              data-type={r.type}
              data-status={r.status}
              className={`flex items-center gap-3 rounded-[14px] border px-3.5 py-2.5 ${call && r.status === "PENDING" ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]" : ""}`}
            >
              <RegisterIcon name={call ? "flag" : pay ? "qr" : "doc"} size={16} className="shrink-0 text-[color:var(--color-accent)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold text-[color:var(--color-ink)]">{title}</span>
                <span className="block truncate text-[12px] text-[color:var(--color-muted)]">{[t("alerts.fromQr"), mins].filter(Boolean).join(" · ")}</span>
              </span>
              {call ? (
                r.status === "PENDING" ? (
                  <button data-testid={`pos-tbl-alert-ack-${r.id}`} type="button" disabled={busy} className={`${btn} bg-[color:var(--color-ink)] text-[color:var(--color-surface)]`} onClick={() => onAck(r)}>
                    {t("alerts.ack")}
                  </button>
                ) : (
                  <button data-testid={`pos-tbl-alert-done-${r.id}`} type="button" disabled={busy} className={`${btn} border`} onClick={() => onDone(r)}>
                    {t("alerts.done")}
                  </button>
                )
              ) : pay ? (
                <button data-testid={`pos-tbl-alert-pay-${r.id}`} type="button" disabled={busy} className={`${btn} bg-[color:var(--color-ink)] text-[color:var(--color-surface)]`} onClick={() => onConfirmPay(r)}>
                  {t("alerts.confirmPayment")}
                </button>
              ) : (
                <button data-testid={`pos-tbl-alert-open-${r.id}`} type="button" disabled={busy} className={`${btn} border`} onClick={() => onOpen(r)}>
                  {t("alerts.openTable")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
