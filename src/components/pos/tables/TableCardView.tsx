"use client";

// TableCardView.tsx — การ์ดโต๊ะบนผัง (POS P2.4U · ภาพ 03 · มติ 2) — 6 ใบต่อแถวบนเดสก์ท็อป
//   ชื่อ + ป้ายสถานะ (ลำดับความสำคัญจาก table-shared) · บรรทัดรองตามสถานะ (§6) · ล่าง: นาทีที่นั่ง + ยอดค้างจ่าย / ทางลัด "เปิดโต๊ะ" "เก็บแล้ว"
//   ว่าง = ขอบเส้นจาง · กำลังทาน = ขอบหมึก · ขอเช็คบิล = พื้น accent อ่อน · ต้องเก็บโต๊ะ = ขอบประ · เลือกอยู่ = ขอบ accent หนา
//   🔴 ตัวการ์ดเป็นปุ่มเดียว (pos-tbl-card-<ชื่อ>) · ทางลัดเป็นปุ่มพี่น้องวางทับมุมล่าง (ไม่ซ้อนปุ่มในปุ่ม)
//   🔴 นาที/เวลาโชว์หลัง mount เท่านั้น (now = null ก่อน mount · HF-418) · เงินมาจากการ์ดของเซิร์ฟเวอร์ (unpaidSatang) ไม่คิดเอง

import { useTranslations } from "next-intl";
import { moneyText } from "@/lib/modules/pos/register-shared";
import type { TableCard } from "@/lib/modules/pos/table-shared";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { bkkClock, minutesSince } from "./table-ui";

type Props = {
  card: TableCard;
  selected: boolean;
  /** เวลาของจอ (ms) — null = ก่อน mount (ไม่วาดนาที/เวลา) */
  now: number | null;
  onPick: () => void;
  onOpen: () => void;
  onCleared: () => void;
  onViewBooking: () => void;
  busy: boolean;
};

const FRAME: Record<TableCard["state"], string> = {
  FREE: "border border-[color:var(--color-line)] bg-[color:var(--color-surface)]",
  DINING: "border-[1.5px] border-[color:var(--color-ink)] bg-[color:var(--color-surface)]",
  BILL_REQUESTED: "border-[1.5px] border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]",
  NEEDS_CLEARING: "border border-dashed border-[color:var(--color-line)] bg-[color:var(--color-surface)]",
  RESERVED: "border border-[color:var(--color-line)] bg-[color:var(--color-surface)]",
  INACTIVE: "border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] opacity-60",
};
const LABEL_TONE: Record<TableCard["state"], string> = {
  FREE: "text-[color:var(--color-muted)] font-normal",
  DINING: "text-[color:var(--color-ink)] font-bold",
  BILL_REQUESTED: "text-[color:var(--color-accent)] font-bold",
  NEEDS_CLEARING: "text-[color:var(--color-muted)] font-normal",
  RESERVED: "text-[color:var(--color-muted)] font-normal",
  INACTIVE: "text-[color:var(--color-muted)] font-normal",
};

export function TableCardView({ card: c, selected, now, onPick, onOpen, onCleared, onViewBooking, busy }: Props) {
  const t = useTranslations("pos.tables");
  const seated = !!c.sessionId;
  const mins = now !== null && c.openedAt ? minutesSince(c.openedAt, now) : null;
  const minsText = mins === null ? "" : mins >= 60 ? t("card.hoursMinutes", { h: Math.floor(mins / 60), m: mins % 60 }) : t("card.minutes", { n: mins });
  const guests = c.guestCount ? t("card.guests", { n: c.guestCount }) : "";
  const member = c.member && c.member.name ? (c.member.tier ? `${c.member.name} · ${c.member.tier}` : c.member.name) : "";

  // บรรทัดรอง (§6) — ข้อความเดียวต่อสถานะ · เตือน "ยังไม่ส่งครัว" ชนะ "พร้อมเสิร์ฟ"
  let sub: React.ReactNode = null;
  if (c.state === "FREE" || c.state === "INACTIVE") sub = <span>{t("card.seats", { n: c.seats })}</span>;
  else if (c.state === "NEEDS_CLEARING") sub = <span>{now !== null ? t("card.dirtyFor", { n: minutesSince(c.dirtySince, now) }) : ""}</span>;
  else if (c.state === "RESERVED" && c.reservation)
    sub = (
      <span>
        {now !== null ? t("card.reservedLine", { time: bkkClock(c.reservation.at), name: c.reservation.name, n: c.reservation.partySize }) : c.reservation.name}
        {now !== null && (
          <>
            {" · "}
            {t("card.holdFrom", { time: bkkClock(new Date(Date.parse(c.reservation.at) - c.reservation.holdFromMinutes * 60_000).toISOString()) })}
          </>
        )}
      </span>
    );
  else if (seated) {
    const tail =
      c.state === "BILL_REQUESTED"
        ? c.flags.payNotified
          ? t("card.payNotified")
          : c.openedByStaff
            ? t("card.atTable")
            : t("card.viaQr")
        : c.flags.callStaff
          ? t("card.callStaff")
          : c.readyCount > 0 && c.unsentCount === 0
            ? t("card.ready", { n: c.readyCount })
            : "";
    sub = (
      <>
        <span>{[guests, member, tail].filter(Boolean).join(" · ")}</span>
        {c.unsentCount > 0 && (
          <span className="mt-0.5 flex items-start gap-1 font-bold text-[color:var(--color-danger)]">
            <RegisterIcon name="warn" size={12} className="mt-[3px] shrink-0" />
            {t("card.unsent", { n: c.unsentCount })}
          </span>
        )}
      </>
    );
  }

  const action =
    c.state === "FREE" ? (
      <button
        data-testid={`pos-tbl-card-open-${c.name}`}
        type="button"
        disabled={busy}
        className="absolute bottom-1.5 right-1.5 h-11 rounded-[10px] px-2.5 text-[13px] font-bold text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
        onClick={onOpen}
      >
        {t("card.open")}
      </button>
    ) : c.state === "NEEDS_CLEARING" ? (
      <button
        data-testid={`pos-tbl-card-clear-${c.name}`}
        type="button"
        disabled={busy}
        className="absolute bottom-1.5 right-1.5 h-11 rounded-[10px] px-2.5 text-[13px] font-bold text-[color:var(--color-accent)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
        onClick={onCleared}
      >
        {t("card.cleared")}
      </button>
    ) : c.state === "RESERVED" ? (
      <button
        data-testid={`pos-tbl-card-booking-${c.name}`}
        type="button"
        className="absolute bottom-2 left-3 right-3 inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] border text-[12.5px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
        onClick={onViewBooking}
      >
        <RegisterIcon name="cal" size={12} />
        {t("card.viewBooking")}
      </button>
    ) : null;

  return (
    <div className="relative min-w-0" data-state={c.state}>
      <button
        data-testid={`pos-tbl-card-${c.name}`}
        data-state={c.state}
        data-selected={selected ? "true" : undefined}
        type="button"
        aria-pressed={selected}
        className={`flex h-full min-h-[136px] w-full flex-col rounded-[16px] px-3.5 pb-3 pt-3 text-left transition-colors xl:min-h-[150px] ${FRAME[c.state]} ${
          selected ? "outline outline-[2.5px] outline-offset-[-1px] outline-[color:var(--color-accent)]" : ""
        }`}
        onClick={onPick}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[17px] font-bold text-[color:var(--color-ink)]">{c.name}</span>
          <span className={`shrink-0 whitespace-nowrap text-[12.5px] ${LABEL_TONE[c.state]}`}>{t(`state.${c.state}`)}</span>
        </span>
        <span className="mt-2 flex min-h-[36px] flex-col text-[12.5px] leading-[1.45] text-[color:var(--color-ink-soft)]">{sub}</span>
        <span className="mt-auto flex items-baseline justify-between gap-2 pt-2">
          <span className="text-[12.5px] text-[color:var(--color-muted)]">{seated ? minsText : c.state === "NEEDS_CLEARING" ? t("card.seats", { n: c.seats }) : ""}</span>
          {seated && (
            <span className={`whitespace-nowrap text-[15px] font-bold tabular-nums ${c.state === "BILL_REQUESTED" ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-ink)]"}`}>
              {moneyText(c.unpaidSatang)}
            </span>
          )}
        </span>
      </button>
      {action}
    </div>
  );
}
