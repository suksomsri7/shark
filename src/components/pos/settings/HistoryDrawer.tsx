"use client";

// HistoryDrawer.tsx — ลิ้นชัก "ประวัติการเปลี่ยน" ของหน้าตั้งค่า POS (P1.18U · มติ 6 · ไม่มีภาพ — โครงเดียวกับลิ้นชักบิลที่พัก 14B)
//   จอ ≥ md = แผงขวา 474 px เต็มสูง · จอ < md = แผ่นล่าง · แถว "<เวลา> · <ชื่อ> · <ประโยค>" · โหลดเพิ่มด้วย nextCursor · ว่าง = ข้อความ
//   ประโยคมาจาก summary ของแต่ละแถว (posSettingsHistoryAction) → คีย์ pos.settings.history.<section>.<key> (หนึ่งคีย์ต่อคีย์ของ summary) ·
//   ไม่รู้จักคีย์ = "แก้ไข <ส่วน>" · แถวเครื่อง/PIN = ประโยคตาม action
//   เปิดได้สองทาง: ปุ่มนาฬิกาบนหัวเมนูของทุกแท็บ (SettingsShell) และปุ่ม "ประวัติการเปลี่ยน" ของแท็บการเชื่อมต่อ (useSettingsHistory)
// 🔴 คำปฏิเสธเป็นข้อมูล → settingsRefusalMessageKey · ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { posSettingsHistoryAction } from "@/lib/modules/pos/settings-actions";
import { settingsRefusalMessageKey, type PosSettingsHistoryItem } from "@/lib/modules/pos/settings-shared";
import { formatShortDate, formatThaiTime } from "@/lib/ui/date";
import { RegisterDialog, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";

type T = ReturnType<typeof useTranslations>;

/** ตัวเปิดลิ้นชักจากแท็บลูก (null = ไม่มีสิทธิ์ดูประวัติ — ไม่แสดงปุ่ม) */
const HistoryOpenCtx = createContext<(() => void) | null>(null);
export const HistoryOpenProvider = HistoryOpenCtx.Provider;
export function useSettingsHistory(): (() => void) | null {
  return useContext(HistoryOpenCtx);
}

/** คีย์ของ summary ที่ไม่ใช่ "สิ่งที่เปลี่ยน" (อ้างอิงเท่านั้น) */
const SKIP = new Set(["systemId", "unitId", "userId", "self", "failedCount", "status", "accountSystemId", "accountSystemIds.count", "posRegNo", "name"]);

const baht = (satang: number, locale: string) => (satang / 100).toLocaleString(locale === "en" ? "en-US" : "th-TH", { maximumFractionDigits: 2 });
const pct = (bp: number, locale: string) => (bp / 100).toLocaleString(locale === "en" ? "en-US" : "th-TH", { maximumFractionDigits: 2 });
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** ค่าของ summary → พารามิเตอร์ของประโยค (สตางค์ → บาท · bp → % · นาที → HH:MM · boolean/enum → สตริงสำหรับ select) */
function valueOf(key: string, v: string | number | boolean | null, locale: string): string | number {
  if (v === null) return "null";
  if (typeof v === "boolean") return String(v);
  if (typeof v === "number") {
    if (key.endsWith("Satang")) return baht(v, locale);
    if (key === "STAFF" || key === "MANAGER" || key.endsWith("rateBp")) return pct(v, locale);
    if (key === "dayCutoffMinutes") return hhmm(v);
    return v;
  }
  return v;
}

/** ประโยคของแถวประวัติ (ภาษาจอ) */
export function historySentence(item: PosSettingsHistoryItem, t: T, locale: string): string {
  const s = item.summary;
  const name = typeof s.name === "string" ? s.name : "";
  if (item.action === "pos.device.register") return t("history.devices.register", { name });
  if (item.action === "pos.device.update") return t("history.devices.update", { name });
  if (item.action === "pos.device.revoke") return t("history.devices.revoke");
  if (item.action === "pos.staff.pin_set") return t("history.staff.pinSet");
  if (item.action === "pos.staff.pin_unlocked") return t("history.staff.pinUnlocked");
  const section = item.section ?? "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(s)) {
    if (SKIP.has(k) || k.startsWith("printerConfig.")) continue;
    const key = `history.${section}.${k}`;
    if (section && t.has(key)) parts.push(t(key, { value: valueOf(k, v, locale) }));
  }
  if (parts.length) return parts.join(" · ");
  const sec = section && t.has(`history.sections.${section}`) ? t(`history.sections.${section}`) : t("history.sections.other");
  return t("history.generic", { section: sec });
}

/** เวลาแบบสัมพัทธ์เมื่อไม่เกิน 24 ชม. ไม่งั้น "วัน เดือน ปี HH:MM" */
function whenText(iso: string, now: number, locale: string): string {
  const at = new Date(iso);
  const diff = Math.round((now - at.getTime()) / 60_000);
  if (diff >= 0 && diff < 24 * 60) {
    const rtf = new Intl.RelativeTimeFormat(locale === "en" ? "en" : "th", { numeric: "auto" });
    return diff < 60 ? rtf.format(-diff, "minute") : rtf.format(-Math.floor(diff / 60), "hour");
  }
  return `${formatShortDate(at, locale)} ${formatThaiTime(at)}`;
}

export function SettingsHistory({ systemId, onClose }: { systemId: string; onClose: () => void }) {
  const t = useTranslations("pos.settings");
  const locale = useLocale();
  const [items, setItems] = useState<PosSettingsHistoryItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [now] = useState(() => Date.now());

  const load = useCallback(
    async (from: string | null) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setErr(null);
      try {
        const r = await posSettingsHistoryAction({ systemId, cursor: from });
        if (r.ok) {
          setItems((prev) => (from && prev ? [...prev, ...r.items.filter((x) => !prev.some((p) => p.id === x.id))] : r.items));
          setCursor(r.nextCursor);
        } else setErr(settingsRefusalMessageKey(r.code));
      } catch {
        setErr("errors.unknown");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [systemId],
  );
  useEffect(() => {
    void load(null);
  }, [load]);
  // Esc = ปิด (หน้าตั้งค่าไม่มีตัวจับแป้นกลางแบบหน้าขาย)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <RegisterDialog onDismiss={onClose}>
      <aside
        data-testid="pos-settings-history"
        className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[16px] bg-[color:var(--color-surface)] shadow-xl md:fixed md:inset-y-0 md:right-0 md:max-h-none md:w-[474px] md:max-w-full md:rounded-none"
        role="dialog"
        aria-modal="true"
        aria-label={t("history.title")}
      >
        <div className="px-5 pt-2 md:hidden">
          <SheetGrab />
        </div>
        <header className="flex shrink-0 items-center gap-3 border-b px-5 py-3 md:px-7 md:py-[18px]">
          <RegisterIcon name="clock" size={20} />
          <h2 className="text-[19px] font-bold">{t("history.title")}</h2>
          <span className="flex-1" />
          <button
            data-testid="pos-settings-history-close"
            className="grid size-11 place-items-center rounded-[11px] text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"
            type="button"
            aria-label={t("history.close")}
            onClick={onClose}
          >
            <RegisterIcon name="x" size={18} />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-3 md:px-7">
          {items === null && !err ? (
            <p className="py-10 text-center text-[14.5px] text-[color:var(--color-muted)]">{t("loading")}</p>
          ) : items !== null && items.length === 0 && !err ? (
            <p data-testid="pos-settings-history-empty" className="py-10 text-center text-[14.5px] text-[color:var(--color-muted)]">
              {t("history.empty")}
            </p>
          ) : (
            <ol className="flex flex-col">
              {(items ?? []).map((h) => (
                <li key={h.id} data-testid="pos-settings-history-row" className="flex flex-col gap-0.5 border-b py-3 text-[14px] last:border-b-0">
                  <span className="text-[12.5px] text-[color:var(--color-muted)]">
                    <span className="tabular-nums">{whenText(h.at, now, locale)}</span>
                    {` · ${h.actorName ?? t("history.system")}`}
                  </span>
                  <span className="break-words text-[color:var(--color-ink)]">{historySentence(h, t, locale)}</span>
                </li>
              ))}
            </ol>
          )}
          {err && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p data-testid="pos-settings-history-error" role="alert" className="text-[14px] text-[color:var(--color-danger)]">
                {t(err)}
              </p>
              <button data-testid="pos-settings-history-retry" type="button" className="btn btn-ghost h-11 rounded-[11px] px-5 text-[14px]" disabled={busy} onClick={() => void load(items?.length ? cursor : null)}>
                {t("retry")}
              </button>
            </div>
          )}
          {cursor && !err && (
            <div className="flex justify-center py-4">
              <button data-testid="pos-settings-history-more" type="button" className="btn btn-ghost h-11 rounded-[11px] px-5 text-[14px]" disabled={busy} onClick={() => void load(cursor)}>
                {busy ? t("loading") : t("history.more")}
              </button>
            </div>
          )}
        </div>
      </aside>
    </RegisterDialog>
  );
}
