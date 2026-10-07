"use client";

// StockCount.tsx — POS P1.14 U จอตรวจนับ (ภาพ 05ค · มือถือก่อน · 1024/1440 = คอลัมน์กลาง max-w-2xl)
//   ไม่มีรอบเปิด = การ์ด "เริ่มตรวจนับ" (ทั้งหมด/เลือกหมวด · ที่เก็บ · นับแบบไม่เห็นยอดระบบ · หมายเหตุ) → open
//   มีรอบเปิด = หัว "ตรวจนับ #n" + ป้ายนับแล้ว + แถบความคืบหน้า · ช่องสแกน/ค้นหา · ชิปกรอง · แถวสินค้า (ระบบ · ช่องจำนวน · ผลต่าง) · แถบล่าง
//   ยืนยัน = กล่องสรุป + เลือกรายการที่ไม่นับ (ข้าม/เป็นศูนย์) → confirm → จอผล · ⋯ = ยกเลิกการนับ (ผู้เปิดรอบ หรือผู้มีสิทธิ์ยืนยัน)
// 🔴 กรอกจำนวน = record SET (blur/Enter) · สแกน = record ADD (ป้ายเครื่องชั่ง = ไม่ส่ง qty — กรัมมาจากป้าย R5) · ทุกครั้งคีย์ใหม่ เก็บไว้จนผลมา
// 🔴 หลังผลบันทึกทุกครั้ง + เมื่อแท็บกลับมามองเห็น = get หนึ่งครั้ง (ไม่มีวนถาม) · action ครั้งละหนึ่ง (ตัวโหลดซ้อนถูกรวบเป็นรอบถัดไป)
// 🔴 blind (summary.withVariance = null) = ซ่อน "ระบบ N" · ผลต่าง · ชิปมีผลต่าง ทั้งหมด

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { ScanCameraDialog } from "@/components/pos/register/ScanCameraDialog";
import { formatBaht } from "@/lib/ui/money";
import type { StockCountMeta } from "@/lib/modules/pos/stock-count";
import { STOCK_COUNT_CATEGORY_MAX, STOCK_COUNT_NOTE_MAX, STOCK_COUNT_REASON_MAX, type StockCountLineView, type StockCountSummary, type StockCountView } from "@/lib/modules/pos/stock-count-shared";
import { parseWeighedBarcode, type WeighedBarcodeSettings } from "@/lib/modules/pos/scan-shared";
import {
  posStockCountCancelAction,
  posStockCountConfirmAction,
  posStockCountGetAction,
  posStockCountOpenAction,
  posStockCountRecordAction,
} from "@/lib/modules/pos/stock-count-actions";
import { bkkHm, fmtDelta, fmtInt, fmtQty, newKey, parseCount, StockIcon, useRefusalText, type T, type Target } from "./stock-ui";

type Props = {
  target: Target;
  meta: StockCountMeta;
  me: { id: string; name: string | null };
  weighed: WeighedBarcodeSettings;
  locationId: string;
  /** รอบที่เปิดอยู่ (ใช้แค่ id — ตัวเต็มมาจาก get) */
  openCount: { id: string } | null;
  openedByName: string | null;
  onOpenCount: (c: { id: string } | null) => void;
  onCounting: (on: boolean) => void;
  onConfirmed: (countId: string, adjustedLines: number) => void;
  onExit: () => void;
};
type Chip = "ALL" | "UNCOUNTED" | "VARIANCE";
type Loaded = { count: StockCountView; lines: StockCountLineView[]; summary: StockCountSummary };
type Done = { countNo: number; adjustedLines: number; varianceValueSatang: number };
/** คำขอที่ยังไม่ได้ผล ต่อสินค้า — ลองใหม่ด้วยค่าเดิม = คีย์เดิม */
type Pending = { qty: number; key: string };

export function StockCount({ target, meta, me, weighed, locationId, openCount, openedByName, onOpenCount, onCounting, onConfirmed, onExit }: Props) {
  const t = useTranslations("pos.stock") as T;
  const locale = useLocale();
  const refusal = useRefusalText();
  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const loading = useRef(false);
  const again = useRef(false);
  const countId = openCount?.id ?? null;

  const load = useCallback(async () => {
    if (!countId) return;
    if (loading.current) {
      again.current = true; // มีตัวโหลดอยู่แล้ว — โหลดอีกรอบหลังจบ (ไม่ยิงซ้อน)
      return;
    }
    loading.current = true;
    try {
      do {
        again.current = false;
        const r = await posStockCountGetAction({ ...target, input: { countId } }).catch(() => null);
        if (!r) setLoadError(refusal("INTERNAL"));
        else if (!r.ok) setLoadError(refusal(r.code));
        else {
          setLoadError(null);
          setData({ count: r.count, lines: r.lines, summary: r.summary });
          if (r.count.status !== "OPEN") onOpenCount(null);
        }
      } while (again.current);
    } finally {
      loading.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countId, target.systemId, target.unitId]);

  useEffect(() => {
    setData(null);
    if (countId) void load();
  }, [countId, load]);
  useEffect(() => {
    if (!countId) return;
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [countId, load]);
  const screen = !meta.can.count ? "denied" : done ? "done" : countId ? "count" : "start";
  useEffect(() => {
    onCounting(screen === "count");
    return () => onCounting(false);
  }, [screen, onCounting]);

  if (screen === "denied") {
    return (
      <div role="alert" className="card text-sm text-[color:var(--color-muted)]" data-testid="pos-stock-count-refusal">
        {refusal("PERMISSION_DENIED")}
      </div>
    );
  }
  if (screen === "done" && done) {
    return (
      <div className="card flex flex-col items-center gap-3 text-center" data-testid="pos-stock-done">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[color:var(--color-ink)] text-[color:var(--color-surface)]">
          <RegisterIcon name="check" size={22} />
        </span>
        <h3 className="text-lg font-bold">{t("done.title", { no: done.countNo })}</h3>
        <p className="text-sm text-[color:var(--color-muted)]">{t("done.body", { n: done.adjustedLines, value: formatBaht(done.varianceValueSatang, { decimals: true }) })}</p>
        <div className="flex w-full gap-2">
          <button type="button" data-testid="pos-stock-done-back" className="btn btn-ghost h-12 flex-1 rounded-[12px]" onClick={onExit}>
            {t("done.back")}
          </button>
          <button type="button" data-testid="pos-stock-done-new" className="btn btn-primary h-12 flex-1 rounded-[12px]" onClick={() => setDone(null)}>
            {t("done.newCount")}
          </button>
        </div>
      </div>
    );
  }
  if (screen === "start") {
    return <StartCard target={target} meta={meta} locationId={locationId} onOpened={onOpenCount} />;
  }
  if (!data) {
    return (
      <div className="card flex flex-col gap-3 text-sm" data-testid="pos-stock-count-loading">
        {loadError ? (
          <>
            <p role="alert" className="text-[color:var(--color-danger)]">
              {loadError}
            </p>
            <button type="button" data-testid="pos-stock-count-retry" className="btn btn-ghost h-11 self-start" onClick={() => void load()}>
              {t("retry")}
            </button>
          </>
        ) : (
          <p className="text-[color:var(--color-muted)]">{t("loading")}</p>
        )}
      </div>
    );
  }
  return (
    <CountScreen
      target={target}
      meta={meta}
      me={me}
      weighed={weighed}
      data={data}
      openedByName={openedByName}
      loadError={loadError}
      onLine={(line) =>
        setData((d) => {
          if (!d) return d;
          const lines = d.lines.map((l) => (l.itemId === line.itemId ? line : l));
          return { ...d, lines };
        })
      }
      reload={() => void load()}
      onExit={onExit}
      onCancelled={() => {
        setData(null);
        onOpenCount(null);
      }}
      onConfirmed={(r) => {
        onConfirmed(data.count.id, r.adjustedLines);
        setDone({ countNo: data.count.countNo, adjustedLines: r.adjustedLines, varianceValueSatang: r.varianceValueSatang });
        setData(null);
        onOpenCount(null);
      }}
    />
  );
}

// ═══════════ เริ่มตรวจนับ ═══════════
function StartCard({ target, meta, locationId, onOpened }: { target: Target; meta: StockCountMeta; locationId: string; onOpened: (c: { id: string }) => void }) {
  const t = useTranslations("pos.stock") as T;
  const refusal = useRefusalText();
  const [scope, setScope] = useState<"ALL" | "CATEGORY">("ALL");
  const [cats, setCats] = useState<string[]>([]);
  const [loc, setLoc] = useState(locationId);
  const [blind, setBlind] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ sig: string; key: string } | null>(null);
  useEffect(() => setLoc(locationId), [locationId]);

  const invalid = scope === "CATEGORY" && (cats.length < 1 || cats.length > STOCK_COUNT_CATEGORY_MAX);
  const submit = async () => {
    if (busy || invalid) return;
    const input = {
      scope,
      ...(scope === "CATEGORY" ? { categoryIds: cats } : {}),
      ...(blind ? { blind: true } : {}),
      ...(loc ? { locationId: loc } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const sig = JSON.stringify(input);
    if (pending.current?.sig !== sig) pending.current = { sig, key: newKey() };
    setBusy(true);
    setError(null);
    const r = await posStockCountOpenAction({ ...target, input: { ...input, idempotencyKey: pending.current.key } }).catch(() => null);
    setBusy(false);
    if (!r) return setError(refusal("INTERNAL"));
    if (r.ok) {
      pending.current = null;
      return onOpened(r.count);
    }
    if (r.code === "COUNT_ALREADY_OPEN" && r.countId) {
      // รอบเปิดอยู่แล้วที่ที่เก็บนี้ — เข้ารอบนั้นแทน (ตัวเต็มมาจาก get)
      pending.current = null;
      return onOpened({ id: r.countId });
    }
    setError(refusal(r.code));
  };

  return (
    <div className="card flex flex-col gap-4" data-testid="pos-stock-start">
      <div className="flex items-center gap-2">
        <StockIcon name="count" size={18} />
        <h3 className="text-[17px] font-bold">{t("start.title")}</h3>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-semibold text-[color:var(--color-muted)]">{t("start.scope")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["ALL", "CATEGORY"] as const).map((s) => (
            <label key={s} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-sm ${scope === s ? "border-[color:var(--color-ink)] font-semibold" : ""}`}>
              <input type="radio" name="pos-stock-scope" data-testid={`pos-stock-start-scope-${s === "ALL" ? "all" : "category"}`} checked={scope === s} onChange={() => setScope(s)} />
              {t(s === "ALL" ? "start.scopeAll" : "start.scopeCategory")}
            </label>
          ))}
        </div>
        {scope === "CATEGORY" && (
          <div className="flex flex-wrap gap-2" data-testid="pos-stock-start-categories">
            {meta.categories.length === 0 && <p className="text-xs text-[color:var(--color-muted)]">{t("start.noCategories")}</p>}
            {meta.categories.map((c) => {
              const on = cats.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  data-testid={`pos-stock-start-cat-${c.id}`}
                  className={`min-h-11 rounded-full border px-3 text-sm ${on ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : ""}`}
                  onClick={() => setCats((xs) => (on ? xs.filter((x) => x !== c.id) : [...xs, c.id]))}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--color-muted)]">
        {t("location")}
        <select data-testid="pos-stock-start-location" className="input h-11 text-[color:var(--color-ink)]" value={loc} onChange={(e) => setLoc(e.target.value)}>
          {meta.locations.length === 0 && <option value="">{t("defaultLocation")}</option>}
          {meta.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[10px] border px-3 text-sm">
        <span className="flex flex-col">
          <span className="font-semibold">{t("start.blind")}</span>
          <span className="text-xs text-[color:var(--color-muted)]">{t("start.blindHint")}</span>
        </span>
        <input type="checkbox" data-testid="pos-stock-start-blind" className="h-5 w-5" checked={blind} onChange={(e) => setBlind(e.target.checked)} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--color-muted)]">
        {t("start.note")}
        <input data-testid="pos-stock-start-note" className="input h-11 text-[color:var(--color-ink)]" maxLength={STOCK_COUNT_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("start.notePlaceholder")} />
      </label>
      {error && (
        <p role="alert" data-testid="pos-stock-start-error" className="text-sm text-[color:var(--color-danger)]">
          {error}
        </p>
      )}
      <button type="button" data-testid="pos-stock-start-submit" className="btn btn-primary h-12 rounded-[12px] text-[15px]" disabled={busy || invalid} onClick={() => void submit()}>
        {busy ? t("saving") : t("start.submit")}
      </button>
    </div>
  );
}

// ═══════════ จอนับ (ภาพ 05ค) ═══════════
function CountScreen({
  target,
  meta,
  me,
  weighed,
  data,
  openedByName,
  loadError,
  onLine,
  reload,
  onExit,
  onCancelled,
  onConfirmed,
}: {
  target: Target;
  meta: StockCountMeta;
  me: { id: string; name: string | null };
  weighed: WeighedBarcodeSettings;
  data: Loaded;
  openedByName: string | null;
  loadError: string | null;
  onLine: (l: StockCountLineView) => void;
  reload: () => void;
  onExit: () => void;
  onCancelled: () => void;
  onConfirmed: (r: { adjustedLines: number; varianceValueSatang: number }) => void;
}) {
  const t = useTranslations("pos.stock") as T;
  const locale = useLocale();
  const refusal = useRefusalText();
  const { count, lines, summary } = data;
  const blindView = summary.withVariance === null;
  const [chip, setChip] = useState<Chip>("ALL");
  const [q, setQ] = useState("");
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<"confirm" | "cancel" | null>(null);
  const pending = useRef<Record<string, Pending>>({});
  const scanPending = useRef<{ code: string; key: string } | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const isOpener = count.openedByUserId === me.id;
  const canCancel = isOpener || meta.can.confirm;
  const opener = isOpener ? (me.name ?? openedByName) : openedByName;
  const scopeLabel =
    count.scope === "ALL"
      ? t("scopeAll")
      : count.categoryIds
          .map((id) => meta.categories.find((c) => c.id === id)?.name)
          .filter(Boolean)
          .join(", ") || t("scopeCategory");
  const locLabel = meta.locations.find((l) => l.id === count.locationId)?.name ?? t("defaultLocation");
  const started = bkkHm(count.snapshotAt, locale);
  const uncounted = summary.total - summary.counted;
  const netVariance = useMemo(() => lines.reduce((s, l) => s + (l.varianceQty ?? 0), 0), [lines]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return lines.filter((l) => {
      if (chip === "UNCOUNTED" && l.countedQty !== null) return false;
      if (chip === "VARIANCE" && !(l.varianceQty !== null && l.varianceQty !== 0)) return false;
      if (!term) return true;
      return l.name.toLowerCase().includes(term) || l.sku.toLowerCase().includes(term) || (l.barcode ?? "").toLowerCase().includes(term);
    });
  }, [lines, chip, q]);

  /** คำขอบันทึกเข้าแถวเดียว (action ถูกส่งทีละตัวอยู่แล้ว — แถวนี้กันลำดับผลสลับ) */
  const enqueue = <R,>(fn: () => Promise<R>): Promise<R> => {
    const p = queue.current.then(fn, fn);
    queue.current = p.catch(() => undefined);
    return p;
  };

  const recordSet = (line: StockCountLineView, raw: string) => {
    const qty = parseCount(raw);
    if (raw.trim() === "") return; // ว่าง = ไม่ส่ง (ช่องคืนค่าเดิม)
    if (qty === null) {
      setRowError((e) => ({ ...e, [line.itemId]: t("count.badQty") }));
      return;
    }
    if (qty === line.countedQty && !pending.current[line.itemId]) {
      setDrafts((d) => {
        const { [line.itemId]: _, ...rest } = d;
        return rest;
      });
      return;
    }
    const prev = pending.current[line.itemId];
    const p: Pending = prev && prev.qty === qty ? prev : { qty, key: newKey() };
    pending.current[line.itemId] = p;
    void enqueue(async () => {
      const r = await posStockCountRecordAction({ ...target, input: { countId: count.id, itemId: line.itemId, qty, mode: "SET", idempotencyKey: p.key } }).catch(() => null);
      if (r && r.ok) {
        if (pending.current[line.itemId]?.key === p.key) delete pending.current[line.itemId];
        onLine(r.line);
        setRowError(({ [line.itemId]: _, ...rest }) => rest);
        setDrafts((d) => {
          if (d[line.itemId] !== raw) return d;
          const { [line.itemId]: __, ...rest } = d;
          return rest;
        });
        reload();
      } else {
        setRowError((e) => ({ ...e, [line.itemId]: refusal(r ? r.code : "INTERNAL") }));
      }
    });
  };

  const scan = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    const label = parseWeighedBarcode(code, weighed);
    if (scanPending.current?.code !== code) scanPending.current = { code, key: newKey() };
    const key = scanPending.current.key;
    void enqueue(async () => {
      const r = await posStockCountRecordAction({ ...target, input: { countId: count.id, code, mode: "ADD", ...(label ? {} : { qty: 1 }), idempotencyKey: key } }).catch(() => null);
      if (r && r.ok) {
        if (scanPending.current?.key === key) scanPending.current = null;
        onLine(r.line);
        setQ((cur) => (cur.trim() === code ? "" : cur));
        setScanMsg({ ok: true, text: t("count.scanned", { name: r.line.name, qty: fmtQty(r.line.countedQty ?? 0, r.line.weighed, locale) }) });
        reload();
      } else {
        setScanMsg({ ok: false, text: refusal(r ? r.code : "INTERNAL") });
      }
    });
  };

  const chips: { key: Chip; label: string; n: number }[] = [
    { key: "ALL", label: t("count.chipAll"), n: summary.total },
    { key: "UNCOUNTED", label: t("count.chipUncounted"), n: uncounted },
    ...(blindView ? [] : [{ key: "VARIANCE" as Chip, label: t("count.chipVariance"), n: summary.withVariance ?? 0 }]),
  ];
  const pct = summary.total > 0 ? Math.round((summary.counted / summary.total) * 100) : 0;

  return (
    <div className="flex flex-col" data-testid="pos-stock-count" data-count-id={count.id}>
      {/* ── หัว ── */}
      <div className="flex flex-col gap-2 pb-3">
        <div className="flex items-center gap-2">
          <button type="button" data-testid="pos-stock-count-back" aria-label={t("count.back")} className="-ml-2 grid h-11 w-11 place-items-center rounded-[10px]" onClick={onExit}>
            <RegisterIcon name="back" size={18} />
          </button>
          <h3 className="text-[20px] font-bold">{t("count.title", { no: count.countNo })}</h3>
          <span className="flex-1" />
          <span data-testid="pos-stock-count-progress" className="inline-flex h-7 items-center rounded-[8px] border border-[color:var(--color-ink)] px-2.5 text-[13px] font-bold tabular-nums">
            {t("count.countedPill", { counted: summary.counted, total: summary.total })}
          </span>
          {canCancel && (
            <div className="relative">
              <button type="button" data-testid="pos-stock-count-menu" aria-label={t("count.menu")} aria-expanded={menu} className="grid h-11 w-11 place-items-center rounded-[10px]" onClick={() => setMenu((m) => !m)}>
                <StockIcon name="dots" size={18} />
              </button>
              {menu && (
                <div className="absolute right-0 top-12 z-20 w-48 rounded-[12px] border bg-[color:var(--color-surface)] p-1 shadow-lg">
                  <button
                    type="button"
                    data-testid="pos-stock-count-cancel"
                    className="flex min-h-11 w-full items-center rounded-[8px] px-3 text-left text-sm text-[color:var(--color-danger)] hover:bg-[color:var(--color-surface-2)]"
                    onClick={() => {
                      setMenu(false);
                      setDialog("cancel");
                    }}
                  >
                    {t("count.cancel")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <p className="text-[12.5px] text-[color:var(--color-muted)]" data-testid="pos-stock-count-sub">
          {[scopeLabel, locLabel, opener ? t("count.startedBy", { time: started, name: opener }) : t("count.started", { time: started })].join(" · ")}
        </p>
        <div className="h-1.5 overflow-hidden rounded-[3px] border bg-[color:var(--color-surface-2)]" role="progressbar" aria-valuemin={0} aria-valuemax={summary.total} aria-valuenow={summary.counted}>
          <i className="block h-full bg-[color:var(--color-ink)]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* ── สแกน/ค้นหา ── */}
      <div className="flex flex-col gap-2.5">
        <label className="flex h-12 items-center gap-2 rounded-[12px] border px-3 focus-within:border-[color:var(--color-ink)]">
          <RegisterIcon name="qr" size={14} className="shrink-0 text-[color:var(--color-muted)]" />
          <input
            data-testid="pos-stock-scan"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none"
            placeholder={t("count.scanPlaceholder")}
            aria-label={t("count.scanPlaceholder")}
            value={q}
            enterKeyHint="go"
            onChange={(e) => {
              setQ(e.target.value);
              setScanMsg(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                scan(q);
              }
            }}
          />
          <button type="button" data-testid="pos-stock-scan-camera" aria-label={t("scanCamera")} className="-mr-2 grid h-11 w-11 place-items-center text-[color:var(--color-ink-soft)]" onClick={() => setCamera(true)}>
            <RegisterIcon name="cam" size={16} />
          </button>
        </label>
        {scanMsg && (
          <p data-testid="pos-stock-scan-result" role={scanMsg.ok ? "status" : "alert"} className={`text-xs ${scanMsg.ok ? "text-[color:var(--color-muted)]" : "text-[color:var(--color-danger)]"}`}>
            {scanMsg.text}
          </p>
        )}
        <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label={t("count.filter")}>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={chip === c.key}
              data-testid={`pos-stock-chip-${c.key === "ALL" ? "all" : c.key === "UNCOUNTED" ? "uncounted" : "variance"}`}
              className={`h-11 shrink-0 rounded-[8px] border px-3 text-[13px] tabular-nums ${chip === c.key ? "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] font-bold text-[color:var(--color-surface)]" : "text-[color:var(--color-muted)]"}`}
              onClick={() => setChip(c.key)}
            >
              {c.label} {fmtInt(c.n, locale)}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <p role="alert" className="mt-2 text-xs text-[color:var(--color-danger)]">
          {loadError}
        </p>
      )}

      {/* ── แถวสินค้า ── */}
      <ul className="mt-1" data-testid="pos-stock-lines">
        {shown.length === 0 && <li className="py-6 text-center text-sm text-[color:var(--color-muted)]">{t("count.empty")}</li>}
        {shown.map((l) => {
          const counted = l.countedQty !== null;
          const isEditing = editing === l.itemId || counted || drafts[l.itemId] !== undefined;
          const draft = drafts[l.itemId];
          const value = draft !== undefined ? draft : counted ? (focused === l.itemId ? String(l.countedQty) : fmtQty(l.countedQty!, l.weighed, locale)) : "";
          const err = rowError[l.itemId];
          return (
            <li key={l.itemId} className="border-b py-2.5" data-testid={`pos-stock-line-${l.itemId}`}>
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <b className="truncate text-[14px] font-semibold">{l.name}</b>
                  <span className="truncate text-[11.5px] text-[color:var(--color-muted)]">
                    {l.sku}
                    {counted ? (l.unitLabel ? ` · ${l.unitLabel}` : "") : ` · ${t("count.notCounted")}`}
                  </span>
                </div>
                {!blindView && l.expectedAtCount !== null ? (
                  <span className="shrink-0 text-[11.5px] tabular-nums text-[color:var(--color-muted)]">{t("count.system", { n: fmtQty(l.expectedAtCount, l.weighed, locale) })}</span>
                ) : !blindView && l.snapshotQty !== null ? (
                  <span className="shrink-0 text-[11.5px] tabular-nums text-[color:var(--color-muted)]">{t("count.system", { n: fmtQty(l.snapshotQty, l.weighed, locale) })}</span>
                ) : null}
                {isEditing ? (
                  <input
                    data-testid={`pos-stock-qty-${l.itemId}`}
                    inputMode="numeric"
                    aria-label={t("count.qtyFor", { name: l.name })}
                    autoFocus={editing === l.itemId && !counted && draft === undefined}
                    className={`h-11 shrink-0 rounded-[10px] border bg-[color:var(--color-surface)] text-center text-[15px] font-bold tabular-nums outline-none focus:border-2 focus:border-[color:var(--color-accent)] ${l.weighed ? "w-24" : "w-[54px]"} ${err ? "border-[color:var(--color-danger)]" : ""}`}
                    value={value}
                    onFocus={() => setFocused(l.itemId)}
                    onChange={(e) => setDrafts((d) => ({ ...d, [l.itemId]: e.target.value }))}
                    onBlur={() => {
                      setFocused(null);
                      setEditing((cur) => (cur === l.itemId ? null : cur));
                      if (draft !== undefined) recordSet(l, draft);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    data-testid={`pos-stock-qty-${l.itemId}`}
                    className={`h-11 shrink-0 rounded-[10px] border text-[13px] text-[color:var(--color-muted)] ${l.weighed ? "w-24" : "w-[54px]"}`}
                    onClick={() => setEditing(l.itemId)}
                  >
                    {t("count.countBtn")}
                  </button>
                )}
                <span className="w-9 shrink-0 text-right text-[13px] font-bold tabular-nums" data-testid={`pos-stock-var-${l.itemId}`}>
                  {counted && l.varianceQty !== null ? (
                    l.varianceQty === 0 ? (
                      <RegisterIcon name="check" size={14} className="ml-auto text-[color:var(--color-ink-soft)]" />
                    ) : (
                      <span className={l.varianceQty < 0 ? "text-[color:var(--color-danger)]" : ""}>{fmtDelta(l.varianceQty, false, locale)}</span>
                    )
                  ) : null}
                </span>
              </div>
              {err && (
                <p role="alert" data-testid={`pos-stock-line-error-${l.itemId}`} className="mt-1 text-xs text-[color:var(--color-danger)]">
                  {err}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {/* ── แถบล่าง (ติดล่างจอ) · R2 R3: โน้ตบวกกลับอยู่ในแถบเหนือปุ่ม — เดิมอยู่ท้ายลิสต์แล้วถูกแถบ sticky บัง ── */}
      <div className="sticky bottom-0 z-10 mt-4 flex flex-col gap-2.5 border-t bg-[color:var(--color-surface)] pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
        <p data-testid="pos-stock-count-addback" className="self-start rounded-[10px] border border-dashed px-3 py-1.5 text-[12.5px] text-[color:var(--color-muted)]">
          <RegisterIcon name="clock" size={12} className="mr-1 inline-block align-[-2px]" />
          {t("count.addBackNote")}
        </p>
        {meta.can.confirm ? (
          <div className="flex gap-2">
            <button type="button" data-testid="pos-stock-count-pause" className="btn btn-ghost h-12 rounded-[12px] px-5 text-[15px]" onClick={onExit}>
              {t("count.pause")}
            </button>
            <button type="button" data-testid="pos-stock-count-confirm" className="btn btn-primary h-12 flex-1 rounded-[12px] text-[15px]" onClick={() => setDialog("confirm")}>
              {summary.withVariance ? t("count.confirmN", { n: summary.withVariance }) : t("count.confirmNone")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button type="button" data-testid="pos-stock-count-pause" className="btn btn-ghost h-12 rounded-[12px] px-5 text-[15px]" onClick={onExit}>
                {t("count.pause")}
              </button>
              <button type="button" data-testid="pos-stock-count-confirm" className="btn btn-primary h-12 flex-1 rounded-[12px] text-[15px] opacity-50" disabled aria-describedby="pos-stock-confirm-why">
                {t("count.sendToManager")}
              </button>
            </div>
            <p id="pos-stock-confirm-why" className="text-xs text-[color:var(--color-muted)]">
              {t("count.needAdjust")}
            </p>
          </div>
        )}
      </div>

      {camera && (
        <ScanCameraDialog
          onCode={(code) => {
            setCamera(false);
            scan(code);
          }}
          onClose={() => setCamera(false)}
        />
      )}
      {dialog === "confirm" && (
        <ConfirmDialog
          target={target}
          count={count}
          summary={summary}
          netVariance={netVariance}
          uncounted={uncounted}
          onClose={() => setDialog(null)}
          onDone={(r) => {
            setDialog(null);
            onConfirmed(r);
          }}
        />
      )}
      {dialog === "cancel" && (
        <CancelDialog
          target={target}
          count={count}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            onCancelled();
          }}
        />
      )}
    </div>
  );
}

// ═══════════ ยืนยันผลต่าง ═══════════
function ConfirmDialog({
  target,
  count,
  summary,
  netVariance,
  uncounted,
  onClose,
  onDone,
}: {
  target: Target;
  count: StockCountView;
  summary: StockCountSummary;
  netVariance: number;
  uncounted: number;
  onClose: () => void;
  onDone: (r: { adjustedLines: number; varianceValueSatang: number }) => void;
}) {
  const t = useTranslations("pos.stock") as T;
  const locale = useLocale();
  const refusal = useRefusalText();
  const [mode, setMode] = useState<"SKIP" | "ZERO">("SKIP");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ mode: string; key: string } | null>(null);
  const submit = async () => {
    if (busy) return;
    if (pending.current?.mode !== mode) pending.current = { mode, key: newKey() };
    setBusy(true);
    setError(null);
    const r = await posStockCountConfirmAction({ ...target, input: { countId: count.id, uncounted: mode, idempotencyKey: pending.current.key } }).catch(() => null);
    setBusy(false);
    if (r && r.ok) return onDone({ adjustedLines: r.adjustedLines, varianceValueSatang: r.varianceValueSatang });
    setError(refusal(r ? r.code : "INTERNAL"));
  };
  const row = (label: string, value: string, tid?: string) => (
    <div className="flex justify-between border-b py-2 text-sm last:border-0">
      <span className="text-[color:var(--color-muted)]">{label}</span>
      <b className="tabular-nums" data-testid={tid}>
        {value}
      </b>
    </div>
  );
  return (
    <RegisterDialog onDismiss={onClose} locked={busy}>
      <div data-testid="pos-stock-confirm-dialog" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("confirm.title", { no: count.countNo })}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("confirm.title", { no: count.countNo })}</h2>
        <div className="rounded-[12px] border px-3">
          {row(t("confirm.counted"), `${fmtInt(summary.counted, locale)}/${fmtInt(summary.total, locale)}`)}
          {row(t("confirm.withVariance"), fmtInt(summary.withVariance ?? 0, locale), "pos-stock-confirm-variance")}
          {row(t("confirm.net"), netVariance === 0 ? "0" : fmtDelta(netVariance, false, locale))}
        </div>
        {uncounted > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">{t("confirm.uncounted", { n: uncounted })}</legend>
            {(["SKIP", "ZERO"] as const).map((m) => (
              <label key={m} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border px-3 text-sm ${mode === m ? "border-[color:var(--color-ink)] font-semibold" : ""}`}>
                <input type="radio" name="pos-stock-uncounted" data-testid={`pos-stock-confirm-uncounted-${m === "SKIP" ? "skip" : "zero"}`} checked={mode === m} onChange={() => setMode(m)} />
                {t(m === "SKIP" ? "confirm.skip" : "confirm.zero")}
              </label>
            ))}
          </fieldset>
        )}
        <p className="text-xs text-[color:var(--color-muted)]">{t("confirm.note")}</p>
        {error && (
          <p role="alert" data-testid="pos-stock-confirm-error" className="text-sm text-[color:var(--color-danger)]">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" data-testid="pos-stock-confirm-close" className="btn btn-ghost h-12 flex-1 rounded-[12px]" disabled={busy} onClick={onClose}>
            {t("close")}
          </button>
          <button type="button" data-testid="pos-stock-confirm-submit" className="btn btn-primary h-12 flex-1 rounded-[12px]" disabled={busy} onClick={() => void submit()}>
            {busy ? t("saving") : t("confirm.submit")}
          </button>
        </div>
      </div>
    </RegisterDialog>
  );
}

// ═══════════ ยกเลิกการนับ ═══════════
function CancelDialog({ target, count, onClose, onDone }: { target: Target; count: StockCountView; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("pos.stock") as T;
  const refusal = useRefusalText();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ reason: string; key: string } | null>(null);
  const trimmed = reason.trim();
  const submit = async () => {
    if (busy || !trimmed) return;
    if (pending.current?.reason !== trimmed) pending.current = { reason: trimmed, key: newKey() };
    setBusy(true);
    setError(null);
    const r = await posStockCountCancelAction({ ...target, input: { countId: count.id, reason: trimmed, idempotencyKey: pending.current.key } }).catch(() => null);
    setBusy(false);
    if (r && r.ok) return onDone();
    setError(refusal(r ? r.code : "INTERNAL"));
  };
  return (
    <RegisterDialog onDismiss={onClose} locked={busy}>
      <div data-testid="pos-stock-cancel-dialog" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("cancel.title", { no: count.countNo })}>
        <SheetGrab />
        <h2 className="text-[19px] font-bold">{t("cancel.title", { no: count.countNo })}</h2>
        <p className="text-sm text-[color:var(--color-muted)]">{t("cancel.body")}</p>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t("cancel.reason")}
          <textarea data-testid="pos-stock-cancel-reason" className="input min-h-20 font-normal" maxLength={STOCK_COUNT_REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && (
          <p role="alert" data-testid="pos-stock-cancel-error" className="text-sm text-[color:var(--color-danger)]">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button type="button" data-testid="pos-stock-cancel-close" className="btn btn-ghost h-12 flex-1 rounded-[12px]" disabled={busy} onClick={onClose}>
            {t("close")}
          </button>
          <button type="button" data-testid="pos-stock-cancel-submit" className="btn h-12 flex-1 rounded-[12px] bg-[color:var(--color-danger)] text-[color:var(--color-surface)]" disabled={busy || !trimmed} onClick={() => void submit()}>
            {busy ? t("saving") : t("cancel.submit")}
          </button>
        </div>
      </div>
    </RegisterDialog>
  );
}
