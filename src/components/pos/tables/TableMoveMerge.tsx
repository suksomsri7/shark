"use client";

// TableMoveMerge.tsx — POS P2.5U มติ 8: แผ่น "รวมโต๊ะ" (เลือกโต๊ะที่มีลูกค้า 1–5 โต๊ะ เข้าโต๊ะนี้) + กล่องยืนยันย้าย/รวม (จากการลากบนผัง · โต๊ะที่จองไว้)
//   รวม = registerMergeTablesAction({intoSessionId, fromSessionIds}) · ย้าย = registerMoveTableAction({tableSessionId, toTableId}) — ผู้เรียก (TablesScreen) เรียก action
//   สรุป "รวม A2 + B1 เข้า A1 · 9 คน · ฿x" = จำนวนคน/ยอดค้างจ่ายของการ์ดผังจากเซิร์ฟเวอร์ (บวกค่าที่แสดงอย่างเดียว · ไม่ใช่ยอดเรียกเก็บ — เซิร์ฟเวอร์รวมเอง)
// 🔴 ข้อความผ่าน t() · ปุ่ม ≥ 44px · โทเคนสีเท่านั้น

import { useState } from "react";
import { useTranslations } from "next-intl";
import { moneyText } from "@/lib/modules/pos/register-shared";
import type { TableCard } from "@/lib/modules/pos/table-shared";
import { RegisterDialog, REG_DIALOG_PANEL, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";

/** รวมได้ครั้งละไม่เกิน (= MERGE_MAX_FROMS ของ pos/table.ts registerMergeTables) */
export const MERGE_MAX = 5;

/** ข้อความสรุปการรวม (แผ่นรวม · กล่องยืนยันจากการลาก) */
function useMergeSummary() {
  const t = useTranslations("pos.tables");
  return (into: TableCard, froms: TableCard[]) =>
    t("merge.summary", {
      from: froms.map((c) => c.name).join(" + "),
      into: into.name,
      guests: [into, ...froms].reduce((a, c) => a + (c.guestCount ?? 0), 0),
      total: moneyText([into, ...froms].reduce((a, c) => a + c.unpaidSatang, 0)),
    });
}

export function TableMergeChooser(p: { into: TableCard; tables: TableCard[]; preselect: string[]; busy: boolean; error: string | null; onConfirm: (froms: TableCard[]) => void; onClose: () => void }) {
  const t = useTranslations("pos.tables");
  const summary = useMergeSummary();
  const options = p.tables.filter((c) => c.sessionId && c.id !== p.into.id && c.state !== "INACTIVE");
  const [picked, setPicked] = useState<string[]>(() => p.preselect.filter((id) => options.some((c) => c.id === id)).slice(0, MERGE_MAX));
  const froms = options.filter((c) => picked.includes(c.id));
  const toggle = (c: TableCard) => setPicked((x) => (x.includes(c.id) ? x.filter((y) => y !== c.id) : x.length >= MERGE_MAX ? x : [...x, c.id]));
  return (
    <RegisterDialog onDismiss={p.onClose} locked={p.busy}>
      <div data-testid="pos-tbl-merge-sheet" role="dialog" aria-modal="true" aria-label={t("merge.title")} className={`${REG_DIALOG_PANEL} md:w-[560px]`}>
        <SheetGrab />
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-[19px] font-bold">{t("merge.title")}</h2>
          <button data-testid="pos-tbl-merge-close" type="button" aria-label={t("reservation.close")} disabled={p.busy} className="grid size-11 place-items-center rounded-[12px] text-[color:var(--color-ink-soft)]" onClick={p.onClose}>
            <RegisterIcon name="x" size={18} />
          </button>
        </div>
        <p className="text-[13.5px] text-[color:var(--color-ink-soft)]">
          {t("merge.into", { table: p.into.name })} · {t("merge.pickTables")} · {t("merge.maxTables", { max: MERGE_MAX })}
        </p>
        {options.length === 0 ? (
          <p className="py-6 text-center text-[13.5px] text-[color:var(--color-muted)]">{t("merge.empty")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {options.map((c) => {
              const on = picked.includes(c.id);
              return (
                <button
                  key={c.id}
                  data-testid={`pos-tbl-merge-pick-${c.name}`}
                  type="button"
                  aria-pressed={on}
                  disabled={p.busy || (!on && picked.length >= MERGE_MAX)}
                  className={`flex min-h-[72px] flex-col items-start gap-0.5 rounded-[14px] px-3 py-2.5 text-left disabled:opacity-50 ${on ? "border-[2px] border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)]" : "border-[1.5px] border-[color:var(--color-ink)]"}`}
                  onClick={() => toggle(c)}
                >
                  <span className="flex w-full items-center justify-between gap-1 text-[16px] font-bold">
                    {c.name}
                    {on && <RegisterIcon name="check" size={14} className="text-[color:var(--color-accent)]" />}
                  </span>
                  <span className="text-[12px] text-[color:var(--color-muted)]">{c.guestCount ? t("card.guests", { n: c.guestCount }) : t(`state.${c.state}`)}</span>
                  <span className="text-[12px] font-bold tabular-nums">{c.unsentCount > 0 ? t("billType.hasDraft") : moneyText(c.unpaidSatang)}</span>
                </button>
              );
            })}
          </div>
        )}
        {froms.length > 0 && (
          <p data-testid="pos-tbl-merge-summary" className="rounded-[12px] border px-3.5 py-2.5 text-[14px] font-bold">
            {summary(p.into, froms)}
          </p>
        )}
        {p.error && (
          <p role="alert" className="text-[13px] text-[color:var(--color-danger)]">
            {p.error}
          </p>
        )}
        <button data-testid="pos-tbl-merge-confirm" type="button" disabled={p.busy || froms.length === 0} className="btn btn-primary h-12 rounded-[14px] text-[16px] font-bold" onClick={() => p.onConfirm(froms)}>
          {t("merge.confirm")}
        </button>
      </div>
    </RegisterDialog>
  );
}

/** ยืนยันย้าย (ลากไปโต๊ะว่าง · โต๊ะปลายทางที่จองไว้ = เตือน "จองไว้ 19:00 — ย้ายทับการจอง?") */
export function TableMoveConfirm(p: { from: TableCard; to: TableCard; reservedAt: string | null; busy: boolean; error: string | null; onConfirm: () => void; onClose: () => void }) {
  const t = useTranslations("pos.tables");
  return (
    <RegisterDialog onDismiss={p.onClose} locked={p.busy}>
      <div data-testid="pos-tbl-move-confirm" role="dialog" aria-modal="true" aria-label={t("move.title")} className={REG_DIALOG_PANEL}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("move.title")}</h2>
        <p className="text-[13.5px] text-[color:var(--color-ink-soft)]">{t("move.confirmBody", { from: p.from.name, to: p.to.name })}</p>
        {p.reservedAt && (
          <p data-testid="pos-tbl-move-reserved" className="flex items-center gap-2 rounded-[12px] border border-[color:var(--color-danger)] px-3 py-2 text-[13.5px] font-bold text-[color:var(--color-danger)]">
            <RegisterIcon name="cal" size={14} />
            {t("move.reservedWarn", { time: p.reservedAt })}
          </p>
        )}
        {p.error && (
          <p role="alert" className="text-[13px] text-[color:var(--color-danger)]">
            {p.error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button data-testid="pos-tbl-move-back" type="button" disabled={p.busy} className="btn btn-ghost h-12 rounded-[14px]" onClick={p.onClose}>
            {t("panel.back")}
          </button>
          <button data-testid="pos-tbl-move-confirm-ok" type="button" disabled={p.busy} className="btn btn-primary h-12 rounded-[14px] font-bold" onClick={p.onConfirm}>
            {t("move.confirm", { table: p.to.name })}
          </button>
        </div>
      </div>
    </RegisterDialog>
  );
}

/** ยืนยันรวม (ลากโต๊ะที่มีลูกค้าไปวางบนอีกโต๊ะที่มีลูกค้า = รวมเข้าโต๊ะที่วาง) */
export function TableMergeConfirm(p: { into: TableCard; froms: TableCard[]; busy: boolean; error: string | null; onConfirm: () => void; onClose: () => void }) {
  const t = useTranslations("pos.tables");
  const summary = useMergeSummary();
  return (
    <RegisterDialog onDismiss={p.onClose} locked={p.busy}>
      <div data-testid="pos-tbl-merge-confirm-dialog" role="dialog" aria-modal="true" aria-label={t("merge.title")} className={REG_DIALOG_PANEL}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("merge.title")}</h2>
        <p className="rounded-[12px] border px-3.5 py-2.5 text-[14px] font-bold">{summary(p.into, p.froms)}</p>
        {p.error && (
          <p role="alert" className="text-[13px] text-[color:var(--color-danger)]">
            {p.error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button data-testid="pos-tbl-merge-back" type="button" disabled={p.busy} className="btn btn-ghost h-12 rounded-[14px]" onClick={p.onClose}>
            {t("panel.back")}
          </button>
          <button data-testid="pos-tbl-merge-confirm-ok" type="button" disabled={p.busy} className="btn btn-primary h-12 rounded-[14px] font-bold" onClick={p.onConfirm}>
            {t("merge.confirm")}
          </button>
        </div>
      </div>
    </RegisterDialog>
  );
}
