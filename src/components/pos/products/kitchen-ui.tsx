"use client";

// kitchen-ui.tsx — ส่วน "ครัว" ในลิ้นชักสินค้าจอ 06 (POS P2.6U · มติ 9b · Q4 Q5)
//   สถานีครัว (สินค้าที่ไม่ใช่เมนูเท่านั้น · เมนูตั้งที่หน้าเมนูร้านอาหาร): ตัวเลือกสถานีของสาขา (kdsBoardAction expo → stations) → setProductStationAction
//     (catalog.updateProduct({stationId}) · pos.product.manage) · "ไม่ส่งเข้าครัว" = null
//   ของหมด (86) ของสาขาที่เลือก: ชิป "หมด · 86 แล้ว" + ปุ่ม แจ้งหมด / คืนขาย → setAvailabilityAction({source:"MANUAL"}) · ไม่เลือกสาขา = บอกให้เลือกก่อน
//   🔴 ไม่มีข้อความไทยในไฟล์ (ST7) · ไม่มีเงิน · คำปฏิเสธ = pos.kds.errors.* (kdsRefusalMessageKey)

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { kdsBoardAction, setAvailabilityAction, setProductStationAction } from "@/lib/modules/pos/kds-actions";
import { KDS_EXPO, kdsRefusalMessageKey, type KdsStationTab } from "@/lib/modules/pos/kds-shared";

export type KitchenPatch = { stationId?: string | null; available?: { unitId: string; value: boolean } };

export function ProductKitchenSection({
  systemId,
  product,
  unit,
  canManage,
  canMark,
  onSaved,
}: {
  systemId: string;
  product: { id: string; kind: string; unitId: string | null; stationId?: string | null; available: Record<string, boolean> };
  /** สาขาที่เลือกบนหน้า (null = ทุกสาขา) */
  unit: string | null;
  canManage: boolean;
  canMark: boolean;
  onSaved: (productId: string, patch: KitchenPatch, toast: string) => void;
}) {
  const t = useTranslations("pos.products.kitchen");
  const tk = useTranslations("pos.kds");
  const locale = useLocale();
  const stUnit = unit ?? product.unitId;
  const [stations, setStations] = useState<KdsStationTab[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isMenu = product.kind === "MENU";
  useEffect(() => {
    if (!stUnit || isMenu) {
      setStations([]);
      return;
    }
    let live = true;
    void kdsBoardAction({ systemId, unitId: stUnit, stationId: KDS_EXPO })
      .then((r) => live && setStations(r && r.ok === true ? r.stations : []))
      .catch(() => live && setStations([]));
    return () => {
      live = false;
    };
  }, [systemId, stUnit, isMenu]);

  const setStation = async (stationId: string | null) => {
    if (!stUnit) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await setProductStationAction({ systemId, unitId: stUnit, productId: product.id, stationId });
      if (r.ok) onSaved(product.id, { stationId }, t("stationSaved"));
      else setErr(r.message || tk(kdsRefusalMessageKey(r.code)));
    } catch {
      setErr(tk("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };
  const mark86 = async (available: boolean) => {
    if (!unit) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await setAvailabilityAction({ systemId, unitId: unit, productId: product.id, available, source: "MANUAL" });
      if (r.ok === true) onSaved(product.id, { available: { unitId: unit, value: r.available } }, available ? t("released") : t("markedOut"));
      else setErr(tk(kdsRefusalMessageKey(r.code)));
    } catch {
      setErr(tk("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };
  const out = unit !== null && product.available[unit] === false;
  const stName = (s: KdsStationTab) => (locale === "en" && s.nameEn ? s.nameEn : s.name);

  return (
    <section data-testid="pos-prod-kitchen" className="flex flex-col gap-3 border-t pt-4 text-[13px]">
      <h3 className="text-[13px] font-bold">{t("title")}</h3>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[color:var(--color-muted)]">{t("station")}</span>
        {isMenu ? (
          <p className="text-[12px] text-[color:var(--color-muted)]">{t("menuStationHint")}</p>
        ) : !stUnit ? (
          <p className="text-[12px] text-[color:var(--color-muted)]">{t("pickUnit")}</p>
        ) : (
          <select
            data-testid="pos-prod-station"
            className="input h-11 w-full rounded-[11px] text-[14px] disabled:opacity-60"
            value={product.stationId ?? ""}
            disabled={!canManage || busy || stations === null}
            title={!canManage ? t("noManage") : undefined}
            onChange={(e) => void setStation(e.target.value || null)}
          >
            <option value="">{t("noStation")}</option>
            {(stations ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {stName(s)}
              </option>
            ))}
            {product.stationId && stations && !stations.some((s) => s.id === product.stationId) ? <option value={product.stationId}>{t("otherStation")}</option> : null}
          </select>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[color:var(--color-muted)]">{t("soldOut")}</span>
        {!unit ? (
          <p className="text-[12px] text-[color:var(--color-muted)]">{t("pickUnit")}</p>
        ) : (
          <div className="flex items-center gap-3">
            {out ? (
              <span data-testid="pos-prod-86-chip" className="inline-flex h-7 items-center rounded-lg border border-[color:var(--color-danger)] px-2.5 text-[11.5px] font-bold text-[color:var(--color-danger)]">
                {t("chip86")}
              </span>
            ) : (
              <span className="text-[12.5px] text-[color:var(--color-ink-soft)]">{t("onSale")}</span>
            )}
            <span className="flex-1" />
            <button
              type="button"
              data-testid="pos-prod-86-toggle"
              className={`inline-flex h-11 items-center rounded-[10px] px-3.5 text-[13px] font-bold disabled:opacity-50 ${out ? "border" : "bg-[color:var(--color-danger)] text-[color:var(--color-surface)]"}`}
              disabled={!canMark || busy}
              title={!canMark ? t("noMark") : undefined}
              onClick={() => void mark86(out)}
            >
              {out ? t("release") : t("markOut")}
            </button>
          </div>
        )}
      </div>
      {err && (
        <p role="alert" className="text-[12.5px] text-[color:var(--color-danger)]">
          {err}
        </p>
      )}
    </section>
  );
}
