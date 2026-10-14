"use client";

// KdsEightySix.tsx — แถบล่างของจอครัว + แผ่น "แจ้งของหมด (86)" (POS P2.6U · ภาพ 04 · มติ 8 · Q5)
//   แถบล่าง (≥768): "ค้างทำวันนี้:" 4 ชื่อแรกของ board.pending + "…" · เส้นคั่น · แดง "ของหมด (86):" ชื่อจาก board.eightySix + จาง "— แจ้งหน้าขายและช่องทางออนไลน์แล้ว" ·
//     ปุ่มโปร่ง "แจ้งของหมด" → แผ่นขวา 420px · มือถือ (<768) = ปุ่มเดียว "ค้าง N · หมด M ›" เปิดแผ่นเดียวกัน (มีรายการค้างทำในแผ่น)
//   แผ่น: ค้นหาเมนูของสาขานี้ (registerCatalogAction — แถวเมนู MENU ของสาขา · กรองฝั่ง client) · สลับ หมด/คืนขาย → setAvailabilityAction({source:"KDS"}) ·
//     รายการที่หมดอยู่ตอนนี้ (เวลา · ที่มา) · ช่องหมายเหตุ · คำปฏิเสธผ่านข้อความ pos.kds.errors.*
//   🔴 ไม่มีข้อความไทยในไฟล์ (ST7) · ไม่มีเงิน

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { registerCatalogAction } from "@/lib/modules/pos/register-actions";
import { REGISTER_PAGE_MAX, type RegisterProduct } from "@/lib/modules/pos/register-shared";
import type { KdsBoard, KdsEightySix as Mark } from "@/lib/modules/pos/kds-shared";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { bkkClock } from "./kds-ui";

const PENDING_BAR = 4;
const SOURCE_KEY: Record<Mark["source"], string> = { KDS: "eightySix.bySource.kds", MANUAL: "eightySix.bySource.manual", STOCK: "eightySix.bySource.stock" };

export function KdsBottomBar({ board, mounted, onOpen }: { board: Pick<KdsBoard, "pending" | "eightySix"> | null; mounted: boolean; onOpen: () => void }) {
  const t = useTranslations("pos.kds");
  const pending = board?.pending ?? [];
  const out = board?.eightySix ?? [];
  const pendingTotal = pending.reduce((s, x) => s + x.qty, 0);
  return (
    <>
      <div data-testid="pos-kds-bottom" className="mx-4 mb-4 hidden shrink-0 rounded-[16px] border bg-[color:var(--color-surface)] px-4 py-3 md:block lg:mx-5">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-[13px]">
          <div className="flex min-w-0 items-center gap-3">
            <b className="whitespace-nowrap">{t("pending")}</b>
            <span data-testid="pos-kds-pending" className="truncate text-[color:var(--color-ink-soft)]">
              {pending.length ? pending.slice(0, PENDING_BAR).map((x) => `${x.name} ×${x.qty}`).join(" · ") + (pending.length > PENDING_BAR ? " …" : "") : "—"}
            </span>
          </div>
          <span aria-hidden className="hidden h-7 w-px bg-[color:var(--color-line)] lg:block" />
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <b className="whitespace-nowrap text-[color:var(--color-danger)]">{t("soldOut")}</b>
            <span data-testid="pos-kds-86-list" className="truncate">
              {out.length ? out.map((x) => x.name).join(" · ") : "—"}
            </span>
            {out.length > 0 && <span className="hidden whitespace-nowrap text-[12px] text-[color:var(--color-muted)] xl:inline">{t("soldOutSynced")}</span>}
          </div>
          <button type="button" data-testid="pos-kds-86" className="ml-auto inline-flex h-11 shrink-0 items-center rounded-[10px] border px-4 text-[13px] font-bold hover:bg-[color:var(--color-surface-2)]" onClick={onOpen}>
            {t("markSoldOut")}
          </button>
        </div>
      </div>
      <div className="mx-4 mb-4 shrink-0 md:hidden">
        <button
          type="button"
          data-testid="pos-kds-86-mobile"
          className="flex h-12 w-full items-center gap-2 rounded-[14px] border bg-[color:var(--color-surface)] px-4 text-left text-[14px] font-bold"
          onClick={onOpen}
        >
          <span className="flex-1">{mounted ? t("mobileSummary", { pending: pendingTotal, soldOut: out.length }) : ""}</span>
          <RegisterIcon name="arrow" size={14} />
        </button>
      </div>
    </>
  );
}

export function KdsEightySixSheet({
  systemId,
  unitId,
  board,
  canMark,
  busyId,
  onToggle,
  onClose,
}: {
  systemId: string;
  unitId: string;
  board: Pick<KdsBoard, "pending" | "eightySix"> | null;
  canMark: boolean;
  busyId: string | null;
  onToggle: (productId: string, name: string, available: boolean, note: string | null) => void;
  onClose: () => void;
}) {
  const t = useTranslations("pos.kds");
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<RegisterProduct[] | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const all: RegisterProduct[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 4; i++) {
        const r = await registerCatalogAction({ systemId, unitId, limit: REGISTER_PAGE_MAX, ...(cursor ? { cursor } : {}) }).catch(() => null);
        if (!r || r.ok !== true) break;
        all.push(...r.products.filter((p) => p.kind === "MENU"));
        if (!r.nextCursor) break;
        cursor = r.nextCursor;
      }
      if (live) setItems(all);
    })();
    return () => {
      live = false;
    };
  }, [systemId, unitId]);
  const outIds = useMemo(() => new Set((board?.eightySix ?? []).map((x) => x.productId)), [board]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? []).filter((p) => !s || p.name.toLowerCase().includes(s) || (p.nameEn ?? "").toLowerCase().includes(s)).slice(0, 60);
  }, [items, q]);
  const pending = board?.pending ?? [];
  const cleanNote = note.trim() ? note.trim().slice(0, 200) : null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        data-testid="pos-kds-86-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t("eightySix.title")}
        className="flex h-full w-full flex-col bg-[color:var(--color-surface)] shadow-2xl md:w-[420px]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b px-5 py-3">
          <h2 className="min-w-0 flex-1 truncate text-[17px] font-bold">{t("eightySix.title")}</h2>
          <button type="button" data-testid="pos-kds-86-close" aria-label={t("close")} className="grid size-11 place-items-center rounded-[12px] border" onClick={onClose}>
            <RegisterIcon name="x" size={14} />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {pending.length > 0 && (
            <section className="flex flex-col gap-1 md:hidden">
              <h3 className="text-[12.5px] font-bold text-[color:var(--color-muted)]">{t("pending")}</h3>
              <p className="text-[13.5px]">{pending.map((x) => `${x.name} ×${x.qty}`).join(" · ")}</p>
            </section>
          )}
          <section className="flex flex-col gap-2">
            <h3 className="text-[12.5px] font-bold text-[color:var(--color-muted)]">{t("eightySix.current")}</h3>
            {(board?.eightySix ?? []).length === 0 ? (
              <p className="text-[13.5px] text-[color:var(--color-muted)]">{t("eightySix.none")}</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-[12px] border">
                {(board?.eightySix ?? []).map((x) => (
                  <li key={x.productId} className="flex items-center gap-3 px-3 py-2" data-testid={`pos-kds-86-out-${x.productId}`}>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <b className="truncate text-[14px]">{x.name}</b>
                      <small className="text-[12px] text-[color:var(--color-muted)]">{`${t(SOURCE_KEY[x.source])} · ${bkkClock(x.at)}`}</small>
                    </span>
                    <button
                      type="button"
                      className="inline-flex h-11 shrink-0 items-center rounded-[10px] border px-3 text-[13px] font-bold disabled:opacity-50"
                      disabled={!canMark || busyId === x.productId}
                      title={!canMark ? t("perm.availability") : undefined}
                      onClick={() => onToggle(x.productId, x.name, true, cleanNote)}
                    >
                      {t("eightySix.release")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <label className="flex flex-col gap-1 text-[12.5px] font-bold text-[color:var(--color-ink-soft)]">
            {t("eightySix.note")}
            <input className="input h-11 rounded-[12px] text-[15px]" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} data-testid="pos-kds-86-note" />
          </label>
          <section className="flex flex-col gap-2">
            <input
              className="input h-11 rounded-[12px] text-[15px]"
              type="search"
              value={q}
              placeholder={t("eightySix.search")}
              aria-label={t("eightySix.search")}
              onChange={(e) => setQ(e.target.value)}
              data-testid="pos-kds-86-search"
            />
            {items === null ? (
              <p className="text-[13px] text-[color:var(--color-muted)]">{t("loading")}</p>
            ) : shown.length === 0 ? (
              <p className="text-[13px] text-[color:var(--color-muted)]">{t("eightySix.empty")}</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-[12px] border">
                {shown.map((p) => {
                  const out = outIds.has(p.id) || (p.soldOut && p.soldOutReason === "UNAVAILABLE");
                  return (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2" data-testid={`pos-kds-86-item-${p.id}`}>
                      <span className="min-w-0 flex-1 truncate text-[14px]">{p.name}</span>
                      <button
                        type="button"
                        aria-pressed={out}
                        className={`inline-flex h-11 shrink-0 items-center rounded-[10px] px-3 text-[13px] font-bold disabled:opacity-50 ${
                          out ? "border" : "bg-[color:var(--color-danger)] text-[color:var(--color-surface)]"
                        }`}
                        disabled={!canMark || busyId === p.id}
                        title={!canMark ? t("perm.availability") : undefined}
                        onClick={() => onToggle(p.id, p.name, out, cleanNote)}
                      >
                        {out ? t("eightySix.release") : t("eightySix.markOut")}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
