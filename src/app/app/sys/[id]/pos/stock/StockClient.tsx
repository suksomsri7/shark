"use client";

// StockClient.tsx — POS P1.14 U หน้าสต็อก: หัวหน้า (ภาพ 16: ชื่อ · คำอธิบาย · คลัง · เปิดในระบบคลังสินค้า) + แถบย่อย 5 แท็บ + เลย์เอาต์
//   ตรวจนับ = คอลัมน์กลาง max-w-2xl (ภาพ 05ค · มือถือก่อน) · รับ/โอน/ปรับ = คอลัมน์หลัก + คอลัมน์ขวา (ทางลัดอีกสองใบ + ประวัติล่าสุด) ที่ ≥ xl
//   ประวัติ = รายการรอบตรวจนับของสาขา + การเคลื่อนไหวที่ทำในหน้านี้ (ยังไม่มีตัวอ่านประวัติคลังทั้งระบบ — ลิงก์ "ดูทั้งหมด" ไประบบคลัง)
// 🔴 ไม่ส่ง ?tab= : มือถือ (< md) = ตรวจนับ · md+ = รับของเข้า (ภาพ 16 เปิดที่รับของ) — ตัดสินหลัง mount ด้วย matchMedia
// 🔴 แท็บเปลี่ยนด้วย history.replaceState (ไม่โหลดหน้าใหม่) · เปลี่ยนสาขา = โหลดหน้าใหม่ (ตัวอ่านตั้งต้นอยู่ฝั่งเซิร์ฟเวอร์)

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { StockCountMeta } from "@/lib/modules/pos/stock-count";
import type { WeighedBarcodeSettings } from "@/lib/modules/pos/scan-shared";
import { StockCount } from "./StockCount";
import { AdjustCard, HistoryPanel, ReceiveCard, TransferCard, type SessionMove } from "./StockShortcuts";
import { StockIcon, type StockIconName, type T } from "./stock-ui";

export type StockTab = "count" | "receive" | "transfer" | "adjust" | "history";
type Unit = { id: string; name: string };
type Props = {
  systemId: string;
  units: Unit[];
  unitId: string;
  meta: StockCountMeta;
  initialTab: StockTab | null;
  me: { id: string; name: string | null };
  weighed: WeighedBarcodeSettings;
};
const TABS: { key: StockTab; icon: StockIconName }[] = [
  { key: "count", icon: "count" },
  { key: "receive", icon: "receive" },
  { key: "transfer", icon: "transfer" },
  { key: "adjust", icon: "adjust" },
  { key: "history", icon: "history" },
];

export function StockClient({ systemId, units, unitId, meta, initialTab, me, weighed }: Props) {
  const t = useTranslations("pos.stock") as T;
  const router = useRouter();
  const target = { systemId, unitId };
  const [tab, setTabState] = useState<StockTab | null>(initialTab);
  const defaultLoc = meta.locations.find((l) => l.isDefault) ?? meta.locations[0] ?? null;
  const [locationId, setLocationId] = useState<string>(defaultLoc?.id ?? "");
  const [openCount, setOpenCount] = useState<{ id: string } | null>(meta.openCount);
  const [moves, setMoves] = useState<SessionMove[]>([]);
  /** หน้าจอนับเต็มจอ (มือถือ) — ซ่อนหัวหน้า/แถบย่อยให้ตรงภาพ 05ค */
  const [counting, setCounting] = useState(false);
  /** รอบที่ยืนยันในหน้านี้ — ประวัติแสดง "ผลต่าง n รายการ" ได้ (list ของเซิร์ฟเวอร์ไม่มีตัวเลขนี้) */
  const [confirmedHere, setConfirmedHere] = useState<Record<string, number>>({});
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    if (initialTab) return;
    const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
    setTabState(wide ? "receive" : "count");
  }, [initialTab]);

  const setTab = useCallback((next: StockTab) => {
    setTabState(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* URL ไม่ได้ — แท็บยังเปลี่ยน */
    }
  }, []);

  const addMove = useCallback((m: SessionMove) => setMoves((xs) => [m, ...xs].slice(0, 50)), []);
  const invHref = `/app/sys/${meta.inventorySystemId}`;
  const locName = (id: string) => meta.locations.find((l) => l.id === id)?.name ?? t("defaultLocation");
  const shared = { target, meta, locationId, locName, onMove: addMove };

  const count = (
    <StockCount
      target={target}
      meta={meta}
      me={me}
      weighed={weighed}
      locationId={locationId}
      openCount={openCount}
      openedByName={openCount && openCount.id === meta.openCount?.id ? meta.openedByName : null}
      onOpenCount={(c) => {
        setOpenCount(c);
        setHistoryKey((k) => k + 1);
      }}
      onCounting={setCounting}
      onConfirmed={(id, adjusted) => {
        setConfirmedHere((m) => ({ ...m, [id]: adjusted }));
        setHistoryKey((k) => k + 1);
      }}
      onExit={() => setTab("history")}
    />
  );
  const history = (full: boolean) => (
    <HistoryPanel
      key={`h-${historyKey}-${full ? "f" : "s"}`}
      target={target}
      meta={meta}
      full={full}
      moves={moves}
      confirmedHere={confirmedHere}
      invHref={invHref}
      onResume={() => setTab("count")}
    />
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-5" data-testid="pos-stock-root" data-tab={tab ?? ""}>
      {/* ── หัวหน้า (ภาพ 16) — มือถือขณะนับ = ซ่อน (ภาพ 05ค เต็มจอ) ── */}
      <div className={`flex flex-col gap-4 ${counting && tab === "count" ? "hidden md:flex" : ""}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-[26px] font-bold leading-tight">{t("title")}</h2>
            <p className="text-[13px] text-[color:var(--color-muted)]">{t("subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {units.length > 1 && (
              <label className="flex h-11 items-center gap-1 rounded-[10px] border px-3 text-sm">
                <span className="text-[color:var(--color-muted)]">{t("unit")}:</span>
                <select
                  data-testid="pos-stock-unit"
                  className="bg-transparent font-semibold outline-none"
                  value={unitId}
                  onChange={(e) => router.push(`/app/sys/${systemId}/pos/stock?unit=${encodeURIComponent(e.target.value)}${tab ? `&tab=${tab}` : ""}`)}
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex h-11 items-center gap-1 rounded-[10px] border px-3 text-sm">
              <span className="text-[color:var(--color-muted)]">{t("location")}:</span>
              <select data-testid="pos-stock-location" className="max-w-[180px] bg-transparent font-semibold outline-none" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                {meta.locations.length === 0 && <option value="">{t("defaultLocation")}</option>}
                {meta.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <a data-testid="pos-stock-open-inventory" href={invHref} className="btn btn-ghost h-11 rounded-[10px]">
              <RegisterBox />
              {t("openInventory")}
            </a>
          </div>
        </div>
        {/* ── แถบย่อย ── */}
        <div role="tablist" aria-label={t("title")} className="-mx-1 flex gap-1 overflow-x-auto border-b px-1">
          {TABS.map(({ key, icon }) => {
            const on = tab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={on}
                data-testid={`pos-stock-tab-${key}`}
                className={`-mb-px flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm ${on ? "border-[color:var(--color-ink)] font-semibold" : "border-transparent text-[color:var(--color-muted)]"}`}
                onClick={() => setTab(key)}
              >
                <StockIcon name={icon} size={14} />
                {t(`tabs.${key}`)}
                {key === "count" && openCount && (
                  <span data-testid="pos-stock-tab-count-badge" className="rounded-full bg-[color:var(--color-ink)] px-1.5 text-[10.5px] font-semibold text-[color:var(--color-surface)]">
                    {t("tabs.countOpen")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tab === null ? (
        <p className="text-sm text-[color:var(--color-muted)]">{t("loading")}</p>
      ) : tab === "count" ? (
        <div className="mx-auto w-full max-w-2xl">{count}</div>
      ) : tab === "history" ? (
        <div className="w-full max-w-3xl">{history(true)}</div>
      ) : (
        <div className="grid w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0">
            {tab === "receive" && <ReceiveCard {...shared} me={me} invHref={invHref} />}
            {tab === "transfer" && <TransferCard {...shared} invHref={invHref} />}
            {tab === "adjust" && <AdjustCard {...shared} />}
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            {tab !== "transfer" && (
              <div className="hidden xl:block">
                <TransferCard {...shared} invHref={invHref} compact />
              </div>
            )}
            {tab !== "adjust" && (
              <div className="hidden xl:block">
                <AdjustCard {...shared} compact />
              </div>
            )}
            {history(false)}
          </div>
        </div>
      )}
    </div>
  );
}

/** ไอคอนกล่อง (ปุ่มเปิดระบบคลังสินค้า · ภาพ 16) */
function RegisterBox() {
  return (
    <svg aria-hidden width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 7v10l8 4 8-4V7Z" />
      <path d="m4 7 8 4 8-4M12 11v10" />
    </svg>
  );
}
