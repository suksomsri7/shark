"use client";

// TableFloor.tsx — ผังโต๊ะ (POS P2.4U · ภาพ 03 ซ้าย · มติ 2)
//   แถบบน: แท็บโซน "ในร้าน (12)" · ชิป "คิวรอหน้าร้าน · เร็ว ๆ นี้" (PLANNED — ไม่มีข้อมูลคิวปลอม/แถบคิว) · ปุ่ม "จองโต๊ะวันนี้ N" (เปิดแผ่นจอง มติ 7)
//   แถวตัวเลข (summary ของเซิร์ฟเวอร์) + คำแนะนำ "แตะโต๊ะเพื่อเปิด" (ลากย้าย/รวม = P2.5 ไม่แสดง) → กริดการ์ด 6/แถว (เดสก์ท็อป) →
//   แถบโน้ตโซนแบบนิ่ง (ทางเข้า · เคาน์เตอร์ · ครัว) → คำอธิบายสถานะพร้อมจำนวน
//   🔴 ตัวเลขเงิน/คน/นาทีเฉลี่ยมาจาก summary ของ registerTablesAction เท่านั้น

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { moneyText } from "@/lib/modules/pos/register-shared";
import type { RegisterTablesResult, TableCard } from "@/lib/modules/pos/table-shared";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { TableCardView } from "./TableCardView";
import { LEGEND_STATES } from "./table-ui";

type Floor = Extract<RegisterTablesResult, { ok: true }>;

type Props = {
  floor: Floor;
  zone: string;
  onZone: (zoneId: string) => void;
  selectedId: string | null;
  now: number | null;
  busy: boolean;
  onPick: (c: TableCard) => void;
  onOpen: (c: TableCard) => void;
  onCleared: (c: TableCard) => void;
  onReservations: () => void;
  /** POS P2.7U ▸ "พิมพ์ QR ทุกโต๊ะ" (แผ่น A4) — ไม่ส่ง = ไม่มีปุ่ม ◂ */
  onPrintQr?: () => void;
  /** แถบแจ้งเตือนจากโต๊ะ (จอที่ไม่มีคอลัมน์ขวา วางไว้เหนือกริด) */
  alerts?: React.ReactNode;
  /**
   * POS P2.5U ▸ มติ 8: ลากโต๊ะที่มีลูกค้าเพื่อย้าย/รวม — เมาส์/แทร็กแพดเท่านั้น (pointer: fine · ไม่มีลากด้วยนิ้ว) · null = ปิด (ไม่มีคีย์) ·
   * วางบนโต๊ะว่าง = ย้าย (canMove) · วางบนโต๊ะที่มีลูกค้า = รวม (canMerge) — ผู้เรียกเปิดกล่องยืนยัน ◂
   */
  drag?: { canMove: boolean; canMerge: boolean; onDrop: (from: TableCard, to: TableCard) => void } | null;
};

const SWATCH: Record<string, string> = {
  FREE: "border border-[color:var(--color-line)] bg-[color:var(--color-surface)]",
  DINING: "border-[1.5px] border-[color:var(--color-ink)] bg-[color:var(--color-surface)]",
  BILL_REQUESTED: "border-[1.5px] border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]",
  NEEDS_CLEARING: "border border-dashed border-[color:var(--color-line)]",
  RESERVED: "border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)]",
};

export function TableFloor({ floor, zone, onZone, selectedId, now, busy, onPick, onOpen, onCleared, onReservations, onPrintQr, alerts, drag }: Props) {
  const t = useTranslations("pos.tables");
  // POS P2.5U ▸ มติ 8: ลากได้เฉพาะตัวชี้ละเอียด (เดสก์ท็อป) — รู้หลัง mount ◂
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(pointer: fine)");
    const on = () => setFine(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const dragOn = !!drag && fine && !busy;
  const dragging = useRef<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const dropOk = (to: TableCard): boolean => {
    const from = floor.tables.find((x) => x.id === dragging.current);
    if (!drag || !from || from.id === to.id || to.state === "INACTIVE") return false;
    return to.sessionId ? drag.canMerge : drag.canMove;
  };
  const zones = floor.zones.filter((z) => z.tableCount > 0 || floor.zones.length === 1);
  const multi = zones.length > 1;
  const shown = zone === "all" || !multi ? floor.tables : floor.tables.filter((c) => c.zoneId === zone);
  const count = (s: string) => floor.tables.filter((c) => c.state === s).length;
  const unsent = floor.tables.filter((c) => c.unsentCount > 0).length;
  const s = floor.summary;
  const tab = (on: boolean) =>
    `-mb-px inline-flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[14.5px] ${
      on ? "border-[color:var(--color-accent)] font-bold text-[color:var(--color-ink)]" : "border-transparent text-[color:var(--color-ink-soft)] hover:text-[color:var(--color-ink)]"
    }`;
  return (
    <div data-testid="pos-tbl-floor" className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 pt-1 xl:px-5">
        <div role="tablist" aria-label={t("title")} className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {multi && (
            <button data-testid="pos-tbl-zone-all" role="tab" aria-selected={zone === "all"} type="button" className={tab(zone === "all")} onClick={() => onZone("all")}>
              {t("zoneAll")}
              <span className="text-[12px] font-normal text-[color:var(--color-muted)]">({floor.tables.length})</span>
            </button>
          )}
          {zones.map((z) => (
            <button
              key={z.id}
              data-testid={`pos-tbl-zone-${z.id}`}
              role="tab"
              aria-selected={multi ? zone === z.id : true}
              type="button"
              className={tab(multi ? zone === z.id : true)}
              onClick={() => onZone(z.id)}
            >
              {z.name}
              <span className="text-[12px] font-normal text-[color:var(--color-muted)]">({z.tableCount})</span>
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2 pb-2 pt-1">
          {/* มติ 2 (Q2): คิวหน้าร้าน = PLANNED — ชิปจาง ไม่ใช่ปุ่ม · ไม่มีข้อมูลคิว */}
          <span
            data-testid="pos-tbl-queue-planned"
            aria-disabled="true"
            title={t("queue.planned")}
            className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-[12px] border border-dashed px-3 text-[13px] text-[color:var(--color-muted)]"
          >
            <RegisterIcon name="users" size={13} />
            {t("queue.title")}
            <span className="rounded-[6px] border px-1.5 text-[11px] leading-[18px]">{t("queue.planned")}</span>
          </span>
          <button
            data-testid="pos-tbl-reservations"
            type="button"
            className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-[12px] border px-3 text-[13.5px] text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]"
            onClick={onReservations}
          >
            <RegisterIcon name="cal" size={13} />
            {t("reservationsToday", { n: floor.reservationsToday })}
          </button>
          {onPrintQr ? (
            <button
              data-testid="pos-tbl-print-qr"
              type="button"
              className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-[12px] border px-3 text-[13.5px] text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]"
              onClick={onPrintQr}
            >
              <RegisterIcon name="qr" size={13} />
              {t("qr.printAll")}
            </button>
          ) : null /* POS P2.7U ◂ */}
        </div>
      </div>

      <div data-testid="pos-tbl-summary" className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-[13px] text-[color:var(--color-ink-soft)] xl:px-5">
        <span>{t("summary.used", { used: s.used, total: s.total })}</span>
        <span>{t("summary.guests", { n: s.guests })}</span>
        <span>{t("summary.avgMinutes", { n: s.avgMinutes })}</span>
        <span>{t("summary.unpaid", { amount: moneyText(s.unpaidSatang) })}</span>
        <span className="ml-auto text-[12.5px] text-[color:var(--color-muted)]">
          {t("tapToOpen")}
          {dragOn ? ` · ${t("dragHint")}` : ""}
        </span>
      </div>

      {alerts}

      <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 xl:gap-3.5 xl:px-5">
        {shown.map((c) => (
          <TableCardView
            key={c.id}
            card={c}
            selected={selectedId === c.id}
            now={now}
            busy={busy}
            onPick={() => onPick(c)}
            onOpen={() => onOpen(c)}
            onCleared={() => onCleared(c)}
            onViewBooking={onReservations}
            // POS P2.5U ▸ มติ 8: ต้นทาง = โต๊ะที่มีลูกค้า · ปลายทาง = ว่าง (ย้าย) / มีลูกค้า (รวม) ◂
            drag={
              dragOn
                ? {
                    source: !!c.sessionId,
                    over: over === c.id,
                    onStart: () => {
                      dragging.current = c.id;
                    },
                    onEnd: () => {
                      dragging.current = null;
                      setOver(null);
                    },
                    onOver: () => {
                      if (!dropOk(c)) return false;
                      if (over !== c.id) setOver(c.id);
                      return true;
                    },
                    onLeave: () => setOver((x) => (x === c.id ? null : x)),
                    onDrop: () => {
                      const from = floor.tables.find((x) => x.id === dragging.current);
                      const ok = dropOk(c);
                      dragging.current = null;
                      setOver(null);
                      if (from && ok) drag!.onDrop(from, c);
                    },
                  }
                : null
            }
          />
        ))}
      </div>

      <div data-testid="pos-tbl-zone-note" className="mx-4 mt-4 flex items-center justify-center gap-6 rounded-[12px] border border-dashed px-4 py-2.5 text-[12.5px] text-[color:var(--color-muted)] xl:mx-5">
        <span>{t("zoneNote.entrance")}</span>
        <span aria-hidden>·</span>
        <span>{t("zoneNote.counter")}</span>
        <span aria-hidden>·</span>
        <span>{t("zoneNote.kitchen")}</span>
      </div>

      <div data-testid="pos-tbl-legend" aria-label={t("legend")} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 pb-6 pt-4 text-[12.5px] text-[color:var(--color-ink-soft)] xl:px-5">
        {LEGEND_STATES.map((st) => (
          <span key={st} className="inline-flex items-center gap-2">
            <i aria-hidden className={`inline-block h-3.5 w-[18px] rounded-[4px] ${SWATCH[st] ?? ""}`} />
            {t("legendItem.count", { label: t(`state.${st}`), n: count(st) })}
          </span>
        ))}
        <span className="inline-flex items-center gap-2">
          <i aria-hidden className="inline-block h-3.5 w-[18px] rounded-[4px] border-[2.5px] border-[color:var(--color-accent)]" />
          {t("legendItem.selected")}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[color:var(--color-danger)]">
          <RegisterIcon name="warn" size={13} />
          {t("legendItem.unsent")}
          {unsent > 0 ? ` ${unsent}` : ""}
        </span>
      </div>
    </div>
  );
}
