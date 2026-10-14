"use client";

// KdsTicketCard.tsx — ตั๋วครัว 1 ใบ (POS P2.6U · ภาพ 04 · มติ 4 · brief §6)
//   หัว: "#เลข · ที่มา" (โต๊ะ/QR = ชื่อโต๊ะ · หน้าขาย = ซื้อกลับ · หน้าเดิม = หน้าร้าน · ออนไลน์ = ชิปช่องทาง) · ชิป "เร่ง" · เวลา mm:ss (พร้อม = "พร้อม N นาที") · ⋯
//   เลยเป้า = หัวดำตัวขาว + ท้ายแดง "เลยเป้า N นาที" + ปุ่ม "เสร็จ" ทึบ · ใกล้เป้า = ท้าย "เหลือ N นาทีก่อนเลยเป้า"
//   บรรทัด: จำนวน · ชื่อ 15px · โน้ตตัวหนา · ตัวเลือกจาง · เสร็จแล้ว = ขีดฆ่า (แตะบรรทัดของใบกำลังทำ = เสร็จบรรทัดนั้น · ไม่มีย้อนทีละบรรทัด) ·
//     ยกเลิก = จาง + ชิป "ยกเลิก"
//   ใบใหม่: แตะตรงไหนก็ได้ = เริ่มทำ · ⋯ / กดค้าง = เมนู (เร่ง · พิมพ์ใบนี้ · เลือกใบนี้)
//   🔴 ไม่มีเงิน · ข้อความเวลาวาดหลัง mount (now = null ก่อน mount ⇒ ไม่มีตัวเลขเวลา) · ไม่มีข้อความไทยในไฟล์ (ST7)

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { KdsLine, KdsTicket } from "@/lib/modules/pos/kds-shared";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { channelDisplayName } from "@/components/pos/settings/channel-text";
import { KDS_LONG_PRESS_MS, lateMinutes, minutesSince, mmss2, onlineChannelName, timerOf, warnMinutes } from "./kds-ui";

export type KdsCardPerms = { advance: boolean; rush: boolean };

/** หัวใบ: ข้อความที่มา (ออนไลน์คืนค่าว่าง — ใช้ชิปช่องทางแทน) */
export function useSourceText() {
  const t = useTranslations("pos.kds");
  return (x: Pick<KdsTicket, "source" | "label">): string =>
    x.source === "TABLE"
      ? t("source.table", { table: x.label })
      : x.source === "QR"
        ? t("source.qr", { table: x.label })
        : x.source === "REGISTER"
          ? t("source.register")
          : x.source === "LEGACY"
            ? x.label || t("source.legacy")
            : "";
}

/** ชิปช่องทางออนไลน์ (ภาพ 04 "#17 [LINE MAN]") */
export function KdsChannelChip({ ticket, inverse }: { ticket: Pick<KdsTicket, "label" | "channelCode" | "externalRef">; inverse?: boolean }) {
  const tch = useTranslations("pos.channel");
  const name = channelDisplayName(ticket.channelCode ?? "", onlineChannelName(ticket), tch);
  return (
    <span
      className={`inline-flex h-5 min-w-0 shrink items-center truncate rounded-[6px] border-[1.5px] px-1.5 text-[10.5px] font-bold ${
        inverse ? "border-[color:var(--color-surface)] text-[color:var(--color-surface)]" : "border-[color:var(--color-ink)] text-[color:var(--color-ink)]"
      }`}
    >
      {name}
    </span>
  );
}

function LineRow({ line, tappable, onTap, testId }: { line: KdsLine; tappable: boolean; onTap: () => void; testId: string }) {
  const t = useTranslations("pos.kds");
  const body = (
    <>
      <b className={`w-6 shrink-0 text-[15px] tabular-nums ${line.done || line.cancelled ? "text-[color:var(--color-muted)]" : ""}`}>{line.qty}</b>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`text-[15px] leading-snug ${line.done ? "text-[color:var(--color-muted)] line-through" : line.cancelled ? "text-[color:var(--color-muted)]" : "text-[color:var(--color-ink)]"}`}>
          {line.name}
          {line.cancelled && (
            <span className="ml-2 inline-flex h-5 items-center rounded-[6px] border px-1.5 align-middle text-[10.5px] text-[color:var(--color-muted)]">{t("cancelledLine")}</span>
          )}
        </span>
        {line.note ? <small className={`text-[12px] font-bold ${line.done ? "line-through" : ""} text-[color:var(--color-ink)]`}>{line.note}</small> : null}
        {line.options.length ? <small className={`text-[12px] text-[color:var(--color-muted)] ${line.done ? "line-through" : ""}`}>{line.options.join(" · ")}</small> : null}
      </span>
    </>
  );
  const cls = "flex w-full items-start gap-3 border-t border-[color:var(--color-line)] px-4 py-3 text-left";
  if (!tappable) return <div className={cls} data-testid={testId} data-done={line.done ? "1" : undefined}>{body}</div>;
  return (
    <button type="button" className={`${cls} min-h-11 hover:bg-[color:var(--color-surface-2)]`} data-testid={testId} onClick={onTap} aria-label={t("lineDoneAria", { name: line.name })}>
      {body}
    </button>
  );
}

export function KdsTicketCard({
  ticket: tk,
  now,
  perms,
  busy,
  selected,
  onStart,
  onLineDone,
  onDone,
  onServed,
  onRush,
  onPrint,
  onSelect,
}: {
  ticket: KdsTicket;
  now: number | null;
  perms: KdsCardPerms;
  busy: boolean;
  selected: boolean;
  onStart: () => void;
  onLineDone: (itemId: string) => void;
  onDone: () => void;
  onServed: () => void;
  onRush: (rush: boolean) => void;
  onPrint: () => void;
  onSelect: (on: boolean) => void;
}) {
  const t = useTranslations("pos.kds");
  const sourceText = useSourceText();
  const tm = timerOf(tk, now);
  const ready = tk.state === "READY";
  const isNew = tk.state === "NEW";
  const late = !ready && tm.late;
  const warn = !ready && !late && tm.warn;
  const [menu, setMenu] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  const startPress = () => {
    pressed.current = false;
    press.current = setTimeout(() => {
      pressed.current = true;
      setMenu(true);
    }, KDS_LONG_PRESS_MS);
  };
  const endPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };
  const noAdvance = !perms.advance ? t("perm.advance") : undefined;
  const src = sourceText(tk);
  const timeText =
    now === null ? "" : ready ? t("readyFor", { min: Math.max(0, minutesSince(tk.readyAt ?? null, now)) }) : mmss2(tm.elapsedSec);

  // ท้ายใบ: บริบท (ที่มา · ผู้รับ · คิว · เลขอ้างอิง · เสร็จ d/t)
  const ctx: string[] = [];
  if (ready) {
    if (tk.staffName) ctx.push(t("server", { name: tk.staffName }));
  } else {
    if (tk.doneCount > 0) ctx.push(t("lineProgress", { done: tk.doneCount, total: tk.lineCount }));
    if (tk.source === "TABLE" && tk.staffName) ctx.push(tk.doneCount > 0 ? tk.staffName : t("tableStaff", { name: tk.staffName }));
    else if (tk.source === "QR") ctx.push(t("qrGuest"));
    else if (tk.source === "REGISTER") ctx.push(t("waitingCounter", { n: tk.queueNo ?? tk.no }));
    else if (tk.source === "ONLINE" && tk.externalRef) ctx.push(tk.externalRef);
    else if (tk.staffName) ctx.push(tk.staffName);
  }

  const cardBody = (
    <>
      <div
        className={`flex min-h-12 items-center gap-3 rounded-t-[13px] px-4 py-2.5 ${late ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : ""}`}
        data-late={late ? "1" : undefined}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5 text-[14px] font-bold">
          <span className="shrink-0 tabular-nums">{`#${tk.no}`}</span>
          {tk.source === "ONLINE" ? <KdsChannelChip ticket={tk} inverse={late} /> : src ? <span className="truncate">{`· ${src}`}</span> : null}
          {tk.isRush && (
            <span data-testid={`pos-kds-rush-chip-${tk.orderId}`} className="inline-flex h-6 shrink-0 items-center rounded-[7px] border-[1.5px] border-[color:var(--color-danger)] bg-[color:var(--color-surface)] px-2 text-[11.5px] font-bold text-[color:var(--color-danger)]">
              {t("rush")}
            </span>
          )}
        </span>
        <span className={`shrink-0 text-[14px] font-bold tabular-nums ${late ? "" : ready ? "text-[color:var(--color-ink-soft)]" : "text-[color:var(--color-ink-soft)]"}`} data-testid={`pos-kds-timer-${tk.orderId}`}>
          {timeText}
        </span>
      </div>
      <div className="flex flex-col">
        {tk.lines.map((l) => (
          <LineRow
            key={l.itemId}
            line={l}
            tappable={!isNew && !ready && !l.done && !l.cancelled && perms.advance && !busy}
            onTap={() => onLineDone(l.itemId)}
            testId={`pos-kds-line-${l.itemId}`}
          />
        ))}
      </div>
    </>
  );

  return (
    <div
      ref={box}
      data-testid={`pos-kds-ticket-${tk.orderId}`}
      data-station={tk.stationId}
      data-state={tk.state}
      data-late={late ? "1" : undefined}
      data-warn={warn ? "1" : undefined}
      data-rush={tk.isRush ? "1" : undefined}
      className={`relative flex flex-col overflow-visible rounded-[14px] border bg-[color:var(--color-surface)] ${
        selected ? "ring-2 ring-[color:var(--color-accent)]" : ""
      } ${late || ready ? "border-[1.5px] border-[color:var(--color-ink)]" : "border-[color:var(--color-line)]"}`}
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={endPress}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu(true);
      }}
    >
      {isNew ? (
        <button
          type="button"
          className="flex flex-col text-left disabled:cursor-not-allowed"
          disabled={busy || !perms.advance}
          title={noAdvance ?? t("hints.new")}
          aria-label={`#${tk.no} · ${t("hints.new")}`}
          data-testid={`pos-kds-start-${tk.orderId}`}
          onClick={() => {
            if (pressed.current) return;
            onStart();
          }}
        >
          {cardBody}
        </button>
      ) : (
        cardBody
      )}
      <div className="flex min-h-14 items-center gap-3 rounded-b-[13px] border-t border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-3 py-2 text-[11.5px] text-[color:var(--color-muted)]">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2">
          {late && now !== null && <b className="text-[12px] text-[color:var(--color-danger)]">{t("late", { min: lateMinutes(tm) })}</b>}
          {warn && now !== null && <span className="text-[12px] text-[color:var(--color-ink-soft)]">{t("warn", { min: warnMinutes(tm) })}</span>}
          {!warn && ctx.length > 0 && <span className="truncate">{(late ? "· " : "") + ctx.join(" · ")}</span>}
        </span>
        <button
          type="button"
          data-testid={`pos-kds-more-${tk.orderId}`}
          className="grid size-11 shrink-0 place-items-center rounded-[10px] text-[16px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface)]"
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label={t("menu.more")}
          onClick={() => setMenu((m) => !m)}
        >
          {"⋯"}
        </button>
        {ready ? (
          <button
            type="button"
            data-testid="pos-kds-served"
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] bg-[color:var(--color-ink)] px-4 text-[13px] font-bold text-[color:var(--color-surface)] disabled:opacity-50"
            disabled={busy || !perms.advance}
            title={noAdvance}
            onClick={onServed}
          >
            <RegisterIcon name="check" size={12} />
            {t("served")}
          </button>
        ) : (
          <button
            type="button"
            data-testid="pos-kds-done"
            className={`inline-flex h-11 shrink-0 items-center rounded-[10px] px-4 text-[13px] font-bold disabled:opacity-50 ${
              late ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "border border-[color:var(--color-line)] bg-[color:var(--color-surface)] text-[color:var(--color-ink)]"
            }`}
            disabled={busy || !perms.advance}
            title={noAdvance}
            onClick={onDone}
          >
            {t("done")}
          </button>
        )}
      </div>
      {menu && (
        <div role="menu" className="absolute bottom-14 right-2 z-30 w-56 rounded-[12px] border bg-[color:var(--color-surface)] p-1.5 shadow-xl" data-testid={`pos-kds-menu-${tk.orderId}`}>
          <button
            type="button"
            role="menuitem"
            data-testid="pos-kds-rush"
            className="flex h-11 w-full items-center rounded-[8px] px-2.5 text-left text-[14px] hover:bg-[color:var(--color-surface-2)] disabled:opacity-50"
            disabled={busy || !perms.rush || ready}
            title={!perms.rush ? t("perm.rush") : undefined}
            onClick={() => {
              setMenu(false);
              onRush(!tk.isRush);
            }}
          >
            {tk.isRush ? t("unrush") : t("rush")}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex h-11 w-full items-center rounded-[8px] px-2.5 text-left text-[14px] hover:bg-[color:var(--color-surface-2)]"
            onClick={() => {
              setMenu(false);
              onPrint();
            }}
          >
            {t("menu.printThis")}
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex h-11 w-full items-center rounded-[8px] px-2.5 text-left text-[14px] hover:bg-[color:var(--color-surface-2)]"
            onClick={() => {
              setMenu(false);
              onSelect(!selected);
            }}
          >
            {selected ? t("menu.unselect") : t("menu.select")}
          </button>
        </div>
      )}
    </div>
  );
}
