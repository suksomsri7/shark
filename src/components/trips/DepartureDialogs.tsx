"use client";
// TRIPS T1.2 ▸ กล่องโต้ตอบของจอปฏิทินรอบ (ใบสั่ง §7): ตัดสินต่ำกว่าขั้นต่ำ · ยกเลิกรอบ · ความจุ · เรือ/รถ/ไกด์ · ราคาเฉพาะรอบ · ปิดรับ/หยุดขาย · เพิ่มรอบ · กฎซ้ำ
//   ทุกกล่อง = <Dialog> ของ T1.1 (Escape · กับดักโฟกัส · ไม่ปิดระหว่างบันทึก) + หัวตรึง/เนื้อเลื่อน/แถบปุ่มติดล่าง · ปิดโดยมีค่าที่แก้ ⇒ ถามก่อนทิ้ง
//   🔴 เขียนผ่าน action ที่มีอยู่เท่านั้น (T0.3 departure-actions · T0.5 pricing-actions · T1.2 departure-screen-actions) · ผิดพลาด = ข้อความในกล่อง (ไม่ปิด ไม่ทิ้งค่า)
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { DeparturePanelVM, DepartureSchedulesVM, ScheduleItemVM } from "@/lib/modules/trips";
import {
  cancelDepartureAction,
  createDepartureAction,
  createScheduleAction,
  materializeScheduleAction,
  pauseScheduleAction,
  resumeScheduleAction,
  setDepartureCapacityAction,
  setDepartureStatusAction,
  unassignResourceAction,
  updateScheduleAction,
} from "@/lib/modules/trips/departure-actions";
import { removePriceAction, setPriceAction } from "@/lib/modules/trips/pricing-actions";
import { assignResourceForScreenAction, decideBelowMinAction, setStopSellLocalAction } from "@/lib/modules/trips/departure-screen-actions";
import { BTN, BTN_PRIMARY, Dialog, ErrorLine, Field, INPUT, bahtToSatang, intOrNull, useRunner } from "./ProductsScreenParts";
import { formatBahtShort } from "./trips-shared";
import { BTN_DANGER, useDepDates } from "./DepartureParts";

const INT4_MAX = 2_147_483_647;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numOf = (v: unknown): number | null => (typeof v === "number" ? v : null);
const hmToMin = (s: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
};
const minToHm = (n: number | null): string => (n === null ? "" : `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`);

/** กล่องของจอนี้: Dialog ของ T1.1 + data-testid + แถบปุ่มติดล่าง · ปิดด้วยปุ่มขณะมีค่าที่แก้ ⇒ ถามก่อน (Escape ถามโดย Dialog แล้ว ไม่ถามซ้ำ) */
function DepDialog({ "data-testid": testid, title, busy, dirty, onClose, footer, wide, children }: { "data-testid": string; title: string; busy: boolean; dirty: boolean; onClose: () => void; footer?: ReactNode; wide?: boolean; children: ReactNode }) {
  const t = useTranslations("trips");
  const escAt = useRef(0);
  useEffect(() => {
    const mark = (e: KeyboardEvent) => {
      if (e.key === "Escape") escAt.current = Date.now();
    };
    document.addEventListener("keydown", mark, true);
    return () => document.removeEventListener("keydown", mark, true);
  }, []);
  const close = () => {
    if (busy) return;
    if (dirty && Date.now() - escAt.current > 300 && !window.confirm(t("common.discardConfirm"))) return;
    onClose();
  };
  return (
    <Dialog title={title} onClose={close} closeLabel={t("common.close")} busy={busy} dirty={dirty} wide={wide} flushBottom>
      <div data-testid={testid} className="flex min-w-0 flex-col gap-3 pb-4">
        {children}
      </div>
      {footer ? <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-5 py-3">{footer}</div> : null}
    </Dialog>
  );
}
/** ปุ่มปิดในแถบล่าง (ถามก่อนทิ้งเหมือนปุ่มบนหัว) */
function useGuardedClose(onClose: () => void, busy: boolean, dirty: boolean) {
  const t = useTranslations("trips");
  return () => {
    if (busy) return;
    if (dirty && !window.confirm(t("common.discardConfirm"))) return;
    onClose();
  };
}

// ═══════════════ เหตุผลยกเลิกสำเร็จรูป ═══════════════
const PRESETS = ["weather", "belowMin", "vehicle", "other"] as const;
type Preset = (typeof PRESETS)[number];
function useReason() {
  const t = useTranslations("trips");
  const [preset, setPreset] = useState<Preset>("weather");
  const [text, setText] = useState("");
  const label = t(`departures.cancelReasons.${preset}`);
  const reason = preset === "other" ? text.trim() : text.trim() ? `${label} · ${text.trim()}` : label;
  const valid = reason.length >= 3 && reason.length <= 500;
  const ui = () => (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label={t("departures.cancelDialog.reason")}>
        <select className={INPUT} value={preset} onChange={(e) => setPreset((PRESETS as readonly string[]).includes(e.target.value) ? (e.target.value as Preset) : "other")}>
          {PRESETS.map((p) => (
            <option key={p} value={p}>
              {t(`departures.cancelReasons.${p}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={preset === "other" ? t("departures.cancelDialog.otherText") : t("departures.cancelDialog.note")}>
        <input className={INPUT} value={text} maxLength={400} onChange={(e) => setText(e.target.value)} />
      </Field>
    </div>
  );
  return { reason, valid, ui, dirty: text.trim() !== "" || preset !== "weather" };
}

// ═══════════════ ตัดสินต่ำกว่าขั้นต่ำ ═══════════════
export function DecideDialog({ unitSlug, vm, onClose }: { unitSlug: string; vm: DeparturePanelVM; onClose: () => void }) {
  const t = useTranslations("trips");
  const D = useDepDates();
  const { busy, error, run } = useRunner(t("common.failed"));
  const [choice, setChoice] = useState<"RUN" | "MERGE" | "CANCEL" | null>(null);
  const [target, setTarget] = useState<string | null>(vm.mergeTargets[0]?.departureId ?? null);
  const R = useReason();
  const d = vm.departure;
  const unit = t(`departures.unit.${d.productType === "LIVEABOARD" ? "BERTH" : "SEAT"}`);
  const tgt = vm.mergeTargets.find((x) => x.departureId === target) ?? null;
  const mergeOff = !vm.actions.merge;
  const cancelOff = !vm.actions.cancel || vm.cancelBlocked;
  const summary =
    choice === "RUN"
      ? t("departures.decide.summaryRun", { used: d.used, min: d.minPax ?? 0 })
      : choice === "MERGE" && tgt
        ? t("departures.decide.summaryMerge", { title: tgt.titleTh, time: tgt.timeText.split("–")[0] ?? "" })
        : choice === "CANCEL" && R.valid
          ? t("departures.decide.summaryCancel", { reason: R.reason })
          : null;
  const ready = choice === "RUN" ? vm.actions.run : choice === "MERGE" ? !mergeOff && !!tgt : choice === "CANCEL" ? !cancelOff && R.valid : false;
  const submit = () =>
    run(
      () =>
        decideBelowMinAction(unitSlug, {
          departureId: d.departureId,
          decision: choice,
          ...(choice === "CANCEL" ? { reason: R.reason } : {}),
          ...(choice === "MERGE" ? { targetDepartureId: target } : {}),
        }),
      onClose,
    );
  const opt = (on: boolean, off: boolean) =>
    `flex min-h-11 min-w-0 flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm ${on ? "border-2 border-[color:var(--color-ink)] font-bold" : "border border-[color:var(--color-line)]"} ${off ? "cursor-not-allowed text-[color:var(--color-muted)]" : "text-[color:var(--color-ink)]"}`;
  const close = useGuardedClose(onClose, busy, choice !== null);
  return (
    <DepDialog
      data-testid="trips-decide-dialog"
      title={t("departures.decide.title", { date: D.short(d.localDate), title: d.productTitle })}
      busy={busy}
      dirty={choice !== null}
      onClose={onClose}
      footer={
        <>
          <button type="button" data-testid="trips-decide-confirm" className={choice === "CANCEL" || choice === "MERGE" ? BTN_DANGER : BTN_PRIMARY} disabled={busy || !ready} onClick={() => void submit()}>
            {t("departures.decide.confirm")}
          </button>
          <button type="button" className={BTN} onClick={close}>
            {t("common.cancel")}
          </button>
        </>
      }
    >
      <p className="text-sm text-[color:var(--color-ink-soft)]">
        {t("departures.decide.lead", { used: d.used, min: d.minPax ?? 0, short: d.shortBy ?? 0 })}
        {d.decisionLocal ? ` · ${d.needsDecision ? t("departures.decisions.overdue") : t("departures.decisions.by", { when: `${D.short(d.decisionLocal.ymd)} ${d.decisionLocal.hm}` })}` : ""}
      </p>
      <div role="radiogroup" aria-label={t("departures.decide.title", { date: D.short(d.localDate), title: d.productTitle })} className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
        <button type="button" role="radio" aria-checked={choice === "RUN"} data-testid="trips-decide-run" className={opt(choice === "RUN", !vm.actions.run)} disabled={!vm.actions.run} onClick={() => setChoice("RUN")}>
          <span>{t("departures.decide.run")}</span>
          <span className="font-normal text-[color:var(--color-muted)]">{t("departures.decide.runHint")}</span>
        </button>
        <button type="button" role="radio" aria-checked={choice === "MERGE"} data-testid="trips-decide-merge" className={opt(choice === "MERGE", mergeOff)} disabled={mergeOff} onClick={() => setChoice("MERGE")}>
          <span>{t("departures.decide.merge")}</span>
          <span className="font-normal text-[color:var(--color-muted)]">{vm.cancelBlocked ? t("departures.decide.mergeBlocked") : vm.mergeTargets.length === 0 ? t("departures.decide.noTargets") : t("departures.decide.mergeHint")}</span>
        </button>
        <button type="button" role="radio" aria-checked={choice === "CANCEL"} data-testid="trips-decide-cancel" className={opt(choice === "CANCEL", cancelOff)} disabled={cancelOff} onClick={() => setChoice("CANCEL")}>
          <span className={cancelOff ? "" : "text-[color:var(--color-danger)]"}>{t("departures.decide.cancel")}</span>
          <span className="font-normal text-[color:var(--color-muted)]">{vm.cancelBlocked ? t("departures.cancelDialog.blocked") : t("departures.decide.cancelHint")}</span>
        </button>
      </div>
      {choice === "MERGE" ? (
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-[color:var(--color-ink)]">{t("departures.decide.pickTarget")}</legend>
          {vm.mergeTargets.map((x) => (
            <label key={x.departureId} data-testid={`trips-merge-target-${x.departureId}`} className={`flex min-h-11 min-w-0 cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm ${target === x.departureId ? "border-2 border-[color:var(--color-ink)]" : "border border-[color:var(--color-line)]"}`}>
              <input type="radio" name="merge-target" className="mt-1" checked={target === x.departureId} onChange={() => setTarget(x.departureId)} />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <b>{x.titleTh}</b> · {x.timeText} · {t("departures.decide.targetSeats", { used: x.used, cap: x.capacity, left: x.seatsLeft, unit })}
                {x.resourceClash ? <span className="block text-[color:var(--color-danger)]">{t("departures.decide.clash")}</span> : null}
              </span>
            </label>
          ))}
          <p className="text-sm text-[color:var(--color-muted)]">{t("departures.decide.mergeOnlyEmpty")}</p>
        </fieldset>
      ) : null}
      {choice === "CANCEL" ? R.ui() : null}
      {summary ? (
        <p role="status" className="rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-ink)]">
          {summary}
        </p>
      ) : null}
      <ErrorLine text={error} />
    </DepDialog>
  );
}

// ═══════════════ ยกเลิกรอบ ═══════════════
export function CancelDialog({ unitSlug, vm, onClose }: { unitSlug: string; vm: DeparturePanelVM; onClose: () => void }) {
  const t = useTranslations("trips");
  const D = useDepDates();
  const { busy, error, run } = useRunner(t("common.failed"));
  const R = useReason();
  const d = vm.departure;
  const close = useGuardedClose(onClose, busy, R.dirty);
  const submit = () => run(() => cancelDepartureAction(unitSlug, { departureId: d.departureId, reason: R.reason }), onClose);
  return (
    <DepDialog
      data-testid="trips-cancel-dialog"
      title={t("departures.cancelDialog.title", { date: D.short(d.localDate), title: d.productTitle })}
      busy={busy}
      dirty={R.dirty}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={BTN_DANGER} disabled={busy || !R.valid || vm.cancelBlocked} onClick={() => void submit()}>
            {t("departures.cancelDialog.confirm")}
          </button>
          <button type="button" className={BTN} onClick={close}>
            {t("common.cancel")}
          </button>
        </>
      }
    >
      {vm.cancelBlocked ? (
        <p role="alert" className="rounded-lg border border-dashed border-[color:var(--color-danger)] px-3 py-2 text-sm text-[color:var(--color-danger)]">
          {t("departures.cancelDialog.blockedLong", { n: d.sold + d.held + d.reserved })}
        </p>
      ) : null}
      <div data-testid="trips-cancel-reason">{R.ui()}</div>
      {R.valid && !vm.cancelBlocked ? (
        <p role="status" className="rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-ink)]">
          {t("departures.decide.summaryCancel", { reason: R.reason })}
        </p>
      ) : null}
      <ErrorLine text={error} />
    </DepDialog>
  );
}

// ═══════════════ ความจุ ═══════════════
export function CapacityDialog({ unitSlug, vm, onClose }: { unitSlug: string; vm: DeparturePanelVM; onClose: () => void }) {
  const t = useTranslations("trips");
  const { busy, error, setError, run } = useRunner(t("common.failed"));
  const d = vm.departure;
  const [text, setText] = useState(String(d.capacity));
  const n = intOrNull(text);
  const people = d.sold + d.held + d.reserved;
  const dirty = text !== String(d.capacity);
  const close = useGuardedClose(onClose, busy, dirty);
  const submit = async () => {
    const box: { used: number | null } = { used: null };
    const ok = await run(async () => {
      const r = await setDepartureCapacityAction(unitSlug, { departureId: d.departureId, capacity: n });
      if (!r.ok && r.code === "CAPACITY_BELOW_USED") box.used = numOf(r.used);
      return r;
    }, onClose);
    if (!ok && box.used !== null) setError(t("departures.capacityDialog.belowUsed", { n: box.used }));
  };
  return (
    <DepDialog
      data-testid="trips-capacity-dialog"
      title={t("departures.capacityDialog.title")}
      busy={busy}
      dirty={dirty}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={BTN_PRIMARY} disabled={busy || n === null || n > INT4_MAX || !dirty} onClick={() => void submit()}>
            {t("common.save")}
          </button>
          <button type="button" className={BTN} onClick={close}>
            {t("common.cancel")}
          </button>
        </>
      }
    >
      <Field label={t("departures.capacityDialog.label")} hint={t("departures.capacityDialog.used", { n: people })}>
        <input data-testid="trips-capacity-input" inputMode="numeric" className={INPUT} value={text} onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))} />
      </Field>
      <ErrorLine text={error} />
    </DepDialog>
  );
}

// ═══════════════ เรือ/รถ/ไกด์ ═══════════════
export function ResourceDialog({ unitSlug, vm, resources, onClose }: { unitSlug: string; vm: DeparturePanelVM; resources: DepartureSchedulesVM["resources"]; onClose: () => void }) {
  const t = useTranslations("trips");
  const D = useDepDates();
  const { busy, error, setError, run } = useRunner(t("common.failed"));
  const d = vm.departure;
  const [pick, setPick] = useState("");
  const assigned = new Set(d.resources.map((r) => r.resourceId));
  const free = resources.filter((r) => r.active && !assigned.has(r.id));
  const close = useGuardedClose(onClose, busy, pick !== "");
  const add = async () => {
    const box: { clash: { localDate: string; timeText: string; productTitle: string } | null } = { clash: null };
    const ok = await run(async () => {
      const r = await assignResourceForScreenAction(unitSlug, { departureId: d.departureId, resourceId: pick });
      if (!r.ok && "clash" in r && isObj(r.clash)) box.clash = { localDate: String(r.clash.localDate), timeText: String(r.clash.timeText), productTitle: String(r.clash.productTitle) };
      return r;
    }, () => setPick(""));
    const c = box.clash;
    if (!ok && c) setError(t("departures.resourceDialog.clash", { date: D.short(c.localDate), title: c.productTitle, time: c.timeText }));
  };
  return (
    <DepDialog
      data-testid="trips-resource-dialog"
      title={t("departures.resourceDialog.title")}
      busy={busy}
      dirty={pick !== ""}
      onClose={onClose}
      footer={
        <button type="button" className={BTN} onClick={close}>
          {t("common.close")}
        </button>
      }
    >
      <h3 className="text-sm font-bold text-[color:var(--color-ink)]">{t("departures.resourceDialog.assigned")}</h3>
      {d.resources.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">{t("departures.resourceDialog.none")}</p> : null}
      <ul className="flex min-w-0 flex-col gap-2">
        {d.resources.map((r) => (
          <li key={r.resourceId} data-testid={`trips-resource-row-${r.resourceId}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm">
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {t(`departures.resourceKind.${r.kind}`)} · <b>{r.name}</b>
              {r.seats !== null ? ` · ${t("departures.resourceDialog.seats", { n: r.seats })}` : ""}
            </span>
            <button type="button" className={BTN} disabled={busy} onClick={() => void run(() => unassignResourceAction(unitSlug, { departureId: d.departureId, resourceId: r.resourceId }))}>
              {t("departures.resourceDialog.remove")}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label={t("departures.resourceDialog.add")}>
            <select className={INPUT} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{t("departures.resourceDialog.pick")}</option>
              {free.map((r) => (
                <option key={r.id} value={r.id}>
                  {`${t(`departures.resourceKind.${r.kind}`)} · ${r.name}${r.seats !== null ? ` · ${t("departures.resourceDialog.seats", { n: r.seats })}` : ""}`}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button type="button" className={BTN_PRIMARY} disabled={busy || !pick} onClick={() => void add()}>
          {t("departures.resourceDialog.addBtn")}
        </button>
      </div>
      <ErrorLine text={error} />
    </DepDialog>
  );
}

// ═══════════════ ราคาเฉพาะรอบ ═══════════════
export function PriceDialog({ unitSlug, vm, onClose }: { unitSlug: string; vm: DeparturePanelVM; onClose: () => void }) {
  const t = useTranslations("trips");
  const D = useDepDates();
  const { busy, error, run } = useRunner(t("common.failed"));
  const price = vm.price;
  const d = vm.departure;
  const init = Object.fromEntries((price?.rows ?? []).map((r) => [r.paxTypeId, r.satang !== null ? String(r.satang / 100) : ""]));
  const [vals, setVals] = useState<Record<string, string>>(init);
  const [removing, setRemoving] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const dirty = Object.entries(vals).some(([k, v]) => v !== init[k]) || why.trim() !== "";
  const close = useGuardedClose(onClose, busy, dirty);
  if (!price) return null;
  const save = (paxTypeId: string) => {
    const amountMinor = bahtToSatang(vals[paxTypeId] ?? "");
    if (amountMinor === null || amountMinor > INT4_MAX) return;
    void run(() => setPriceAction(unitSlug, { productId: price.productId, paxTypeId, departureId: d.departureId, currency: price.currency, amountMinor }));
  };
  const remove = (id: string) =>
    void run(
      () => removePriceAction(unitSlug, { id, reason: why.trim() }),
      () => {
        setRemoving(null);
        setWhy("");
      },
    );
  return (
    <DepDialog
      data-testid="trips-price-dialog"
      title={t("departures.priceDialog.title", { date: D.short(d.localDate), title: d.productTitle })}
      busy={busy}
      dirty={dirty}
      onClose={onClose}
      footer={
        <button type="button" className={BTN} onClick={close}>
          {t("common.close")}
        </button>
      }
    >
      <p className="text-sm text-[color:var(--color-ink-soft)]">{price.canEdit ? t("departures.priceDialog.note") : t("departures.priceDialog.readOnly")}</p>
      <ul className="flex min-w-0 flex-col gap-2">
        {price.rows.map((r) => {
          const v = vals[r.paxTypeId] ?? "";
          const s = bahtToSatang(v);
          const changed = v !== init[r.paxTypeId];
          return (
            <li key={r.paxTypeId} data-testid={`trips-price-row-${r.code}`} className="flex min-w-0 flex-col gap-2 rounded-lg border border-[color:var(--color-line)] p-3">
              <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2 text-sm">
                <b className="text-[color:var(--color-ink)]">{r.labelTh}</b>
                <span className="text-[color:var(--color-ink-soft)]">
                  {r.satang !== null ? `${formatBahtShort(r.satang)} ${price.currency}` : "—"} · {t(`departures.priceDialog.src.${r.source}`)}
                </span>
              </div>
              {price.canEdit ? (
                <div className="flex min-w-0 flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Field label={t("departures.priceDialog.newPrice", { currency: price.currency })}>
                      <input inputMode="decimal" className={INPUT} value={v} onChange={(e) => setVals({ ...vals, [r.paxTypeId]: e.target.value })} />
                    </Field>
                  </div>
                  <button type="button" className={BTN_PRIMARY} disabled={busy || !changed || s === null || s > INT4_MAX} onClick={() => save(r.paxTypeId)}>
                    {t("departures.priceDialog.save")}
                  </button>
                  {r.departurePriceId ? (
                    <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => setRemoving(removing === r.departurePriceId ? null : r.departurePriceId)}>
                      {t("departures.priceDialog.remove")}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {removing !== null && removing === r.departurePriceId ? (
                <div className="flex min-w-0 flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Field label={t("departures.priceDialog.removeReason")} hint={t("departures.priceDialog.reasonHint")}>
                      <input className={INPUT} value={why} maxLength={500} onChange={(e) => setWhy(e.target.value)} />
                    </Field>
                  </div>
                  <button type="button" className={BTN_DANGER} disabled={busy || why.trim().length < 10} onClick={() => remove(removing)}>
                    {t("departures.priceDialog.removeConfirm")}
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <ErrorLine text={error} />
    </DepDialog>
  );
}

// ═══════════════ ปิดรับจอง + หยุดขายบางช่องทาง ═══════════════
export function StopSellDialog({ unitSlug, vm, onClose }: { unitSlug: string; vm: DeparturePanelVM; onClose: () => void }) {
  const t = useTranslations("trips");
  const D = useDepDates();
  const { busy, error, run } = useRunner(t("common.failed"));
  const d = vm.departure;
  const allChannels = d.cutoffGroups.flatMap((g) => g.channels);
  const cur = d.stopSellInfo;
  const [chs, setChs] = useState<string[]>(cur?.channels ?? []);
  const [reason, setReason] = useState(cur?.reason ?? "");
  const [untilDate, setUntilDate] = useState(cur?.untilLocal?.ymd ?? "");
  const [untilTime, setUntilTime] = useState(cur?.untilLocal?.hm ?? "");
  const dirty = chs.join() !== (cur?.channels ?? []).join() || reason !== (cur?.reason ?? "") || untilDate !== (cur?.untilLocal?.ymd ?? "") || untilTime !== (cur?.untilLocal?.hm ?? "");
  const close = useGuardedClose(onClose, busy, dirty);
  const untilMin = hmToMin(untilTime);
  const canSave = chs.length > 0 && reason.trim().length > 0 && (untilDate === "" || /^\d{4}-\d{2}-\d{2}$/.test(untilDate)) && (untilTime === "" || untilMin !== null);
  const save = () =>
    run(
      () => setStopSellLocalAction(unitSlug, { departureId: d.departureId, stopSell: { channels: chs, reason: reason.trim(), ...(untilDate ? { untilDate, untilMin: untilMin ?? 0 } : {}) } }),
      onClose,
    );
  return (
    <DepDialog
      data-testid="trips-stopsell-dialog"
      title={t("departures.stopSellDialog.title", { date: D.short(d.localDate), title: d.productTitle })}
      busy={busy}
      dirty={dirty}
      onClose={onClose}
      wide
      footer={
        <button type="button" className={BTN} onClick={close}>
          {t("common.close")}
        </button>
      }
    >
      {vm.actions.close ? (
        <section className="flex min-w-0 flex-col gap-2 rounded-lg border border-[color:var(--color-line)] p-3">
          <h3 className="text-sm font-bold text-[color:var(--color-ink)]">{t("departures.stopSellDialog.closeAll")}</h3>
          <p className="text-sm text-[color:var(--color-ink-soft)]">{t("departures.stopSellDialog.closeAllHint")}</p>
          <div>
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void run(() => setDepartureStatusAction(unitSlug, { departureId: d.departureId, status: "CLOSED" }), onClose)}>
              {t("departures.stopSellDialog.closeAllBtn")}
            </button>
          </div>
        </section>
      ) : null}
      {vm.actions.stopSell ? (
        <section className="flex min-w-0 flex-col gap-3 rounded-lg border border-[color:var(--color-line)] p-3">
          <h3 className="text-sm font-bold text-[color:var(--color-ink)]">{t("departures.stopSellDialog.partTitle")}</h3>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1 text-sm text-[color:var(--color-ink-soft)]">{t("departures.stopSellDialog.channels")}</legend>
            <div className="grid min-w-0 grid-cols-1 gap-1 sm:grid-cols-2">
              {allChannels.map((c) => (
                <label key={c} className="flex min-h-11 min-w-0 items-center gap-2 text-sm text-[color:var(--color-ink)]">
                  <input type="checkbox" checked={chs.includes(c)} onChange={(e) => setChs(e.target.checked ? [...chs, c] : chs.filter((x) => x !== c))} />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{t(`departures.channel.${c}`)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t("departures.stopSellDialog.reason")}>
            <input className={INPUT} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("departures.stopSellDialog.untilDate")} hint={t("departures.stopSellDialog.untilHint")}>
              <input type="date" className={INPUT} value={untilDate} onChange={(e) => setUntilDate(e.target.value)} />
            </Field>
            <Field label={t("departures.stopSellDialog.untilTime")}>
              <input type="time" className={INPUT} value={untilTime} onChange={(e) => setUntilTime(e.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="trips-dep-stopsell" className={BTN_PRIMARY} disabled={busy || !canSave} onClick={() => void save()}>
              {t("departures.stopSellDialog.save")}
            </button>
            {cur ? (
              <button type="button" className={BTN} disabled={busy} onClick={() => void run(() => setStopSellLocalAction(unitSlug, { departureId: d.departureId, stopSell: null }), onClose)}>
                {t("departures.stopSellDialog.clear")}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}
      <ErrorLine text={error} />
    </DepDialog>
  );
}

// ═══════════════ + เพิ่มรอบ ═══════════════
export function CreateDepartureDialog({ unitSlug, sched, defaultDate, onClose }: { unitSlug: string; sched: DepartureSchedulesVM; defaultDate: string; onClose: () => void }) {
  const t = useTranslations("trips");
  const { busy, error, run } = useRunner(t("common.failed"));
  const products = sched.products.filter((p) => p.options.some((o) => o.active));
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const prod = products.find((p) => p.id === productId);
  const opts = (prod?.options ?? []).filter((o) => o.active);
  const [optionId, setOptionId] = useState(opts[0]?.id ?? "");
  const opt = opts.find((o) => o.id === optionId) ?? opts[0];
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(minToHm(opt?.departTimeMin ?? null));
  const [cap, setCap] = useState(opt?.capacity !== null && opt?.capacity !== undefined ? String(opt.capacity) : "");
  const [minPax, setMinPax] = useState(opt?.minPax !== null && opt?.minPax !== undefined ? String(opt.minPax) : "");
  const [dur, setDur] = useState("");
  const [res, setRes] = useState<string[]>(opt?.resourceIds ?? []);
  const [touched, setTouched] = useState(false);
  const pickOption = (id: string, list = opts) => {
    const o = list.find((x) => x.id === id) ?? list[0];
    setOptionId(o?.id ?? "");
    setTime(minToHm(o?.departTimeMin ?? null));
    setCap(o?.capacity !== null && o?.capacity !== undefined ? String(o.capacity) : "");
    setMinPax(o?.minPax !== null && o?.minPax !== undefined ? String(o.minPax) : "");
    setRes(o?.resourceIds ?? []);
  };
  const tm = hmToMin(time);
  const c = intOrNull(cap);
  const mp = minPax.trim() ? intOrNull(minPax) : null;
  const du = dur.trim() ? intOrNull(dur) : null;
  const needsDur = !!opt && opt.durationMin === null && (opt.nights ?? 0) === 0;
  const ok = !!prod && !!opt && /^\d{4}-\d{2}-\d{2}$/.test(date) && tm !== null && c !== null && c > 0 && (minPax.trim() === "" || (mp !== null && mp >= 1)) && (!needsDur || (du !== null && du > 0));
  const close = useGuardedClose(onClose, busy, touched);
  const submit = () =>
    run(
      () =>
        createDepartureAction(unitSlug, {
          productId,
          optionId: opt?.id,
          localDate: date,
          departTimeMin: tm,
          capacity: c,
          ...(minPax.trim() ? { minPax: mp } : {}),
          ...(du !== null ? { durationMin: du } : {}),
          resourceIds: res,
        }),
      onClose,
    );
  return (
    <DepDialog
      data-testid="trips-dep-create-dialog"
      title={t("departures.create.title")}
      busy={busy}
      dirty={touched}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className={BTN_PRIMARY} disabled={busy || !ok} onClick={() => void submit()}>
            {t("departures.create.submit")}
          </button>
          <button type="button" className={BTN} onClick={close}>
            {t("common.cancel")}
          </button>
        </>
      }
    >
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2" onChange={() => setTouched(true)}>
        <Field label={t("departures.create.product")}>
          <select
            className={INPUT}
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              const p = products.find((x) => x.id === e.target.value);
              const list = (p?.options ?? []).filter((o) => o.active);
              pickOption(list[0]?.id ?? "", list);
            }}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titleTh}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("departures.create.option")}>
          <select className={INPUT} value={opt?.id ?? ""} onChange={(e) => pickOption(e.target.value)}>
            {opts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nameTh}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("departures.create.date")}>
          <input type="date" className={INPUT} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t("departures.create.time")}>
          <input type="time" className={INPUT} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label={t("departures.create.capacity")}>
          <input inputMode="numeric" className={INPUT} value={cap} onChange={(e) => setCap(e.target.value.replace(/[^\d]/g, ""))} />
        </Field>
        <Field label={t("departures.create.minPax")} hint={t("departures.create.minPaxHint")}>
          <input inputMode="numeric" className={INPUT} value={minPax} onChange={(e) => setMinPax(e.target.value.replace(/[^\d]/g, ""))} />
        </Field>
        {needsDur ? (
          <Field label={t("departures.create.duration")}>
            <input inputMode="numeric" className={INPUT} value={dur} onChange={(e) => setDur(e.target.value.replace(/[^\d]/g, ""))} />
          </Field>
        ) : null}
      </div>
      <ResourcePicker resources={sched.resources} value={res} onChange={(v) => {
        setRes(v);
        setTouched(true);
      }} />
      <ErrorLine text={error} />
    </DepDialog>
  );
}

function ResourcePicker({ resources, value, onChange }: { resources: DepartureSchedulesVM["resources"]; value: string[]; onChange: (v: string[]) => void }) {
  const t = useTranslations("trips");
  const list = resources.filter((r) => r.active || value.includes(r.id));
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-sm font-medium text-[color:var(--color-ink)]">{t("departures.create.resources")}</legend>
      {list.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">{t("departures.resourceDialog.none")}</p> : null}
      <div className="grid min-w-0 grid-cols-1 gap-1 sm:grid-cols-2">
        {list.map((r) => (
          <label key={r.id} className="flex min-h-11 min-w-0 items-center gap-2 text-sm text-[color:var(--color-ink)]">
            <input type="checkbox" checked={value.includes(r.id)} onChange={(e) => onChange(e.target.checked ? [...value, r.id] : value.filter((x) => x !== r.id))} />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {t(`departures.resourceKind.${r.kind}`)} · {r.name}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ═══════════════ กฎซ้ำ ═══════════════
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
type SchedForm = { scheduleId: string | null; productId: string; optionId: string; kind: "DAILY" | "WEEKLY" | "KEEP"; weekdays: number[]; time: string; cap: string; minPax: string; from: string; to: string; res: string[] };
export function SchedulesDialog({ unitSlug, sched, defaultDate, onClose }: { unitSlug: string; sched: DepartureSchedulesVM; defaultDate: string; onClose: () => void }) {
  const t = useTranslations("trips");
  const D = useDepDates();
  const { busy, error, run } = useRunner(t("common.failed"));
  const [form, setForm] = useState<SchedForm | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const products = sched.products.filter((p) => p.options.some((o) => o.active));
  const blank = (): SchedForm => {
    const p = products[0];
    const o = p?.options.find((x) => x.active);
    return { scheduleId: null, productId: p?.id ?? "", optionId: o?.id ?? "", kind: "DAILY", weekdays: [], time: minToHm(o?.departTimeMin ?? null), cap: o?.capacity !== null && o?.capacity !== undefined ? String(o.capacity) : "", minPax: "", from: defaultDate, to: "", res: o?.resourceIds ?? [] };
  };
  const fromItem = (s: ScheduleItemVM): SchedForm => ({
    scheduleId: s.scheduleId,
    productId: s.productId,
    optionId: s.optionId ?? "",
    kind: s.ruleKind === "DAILY" ? "DAILY" : s.ruleKind === "WEEKLY" ? "WEEKLY" : "KEEP",
    weekdays: s.weekdays ?? [],
    time: s.timeText,
    cap: String(s.capacity),
    minPax: s.minPax !== null ? String(s.minPax) : "",
    from: s.dateFrom,
    to: s.dateTo ?? "",
    res: s.resourceIds,
  });
  const ruleText = (s: ScheduleItemVM) =>
    s.ruleKind === "WEEKLY"
      ? `${t("departures.schedules.rule.WEEKLY")} ${WEEK_ORDER.filter((w) => (s.weekdays ?? []).includes(w))
          .map((w) => t(`dates.wd${w}`))
          .join(" ")}`
      : s.ruleKind === "DATES"
        ? t("departures.schedules.datesN", { n: s.dateCount ?? 0 })
        : t(`departures.schedules.rule.${s.ruleKind}`);
  const close = useGuardedClose(onClose, busy, form !== null);
  const materialize = (id: string) =>
    run(async () => {
      setInfo(null);
      const r = await materializeScheduleAction(unitSlug, { scheduleId: id });
      if (r.ok) setInfo(r.complete ? t("departures.schedules.materialized", { n: r.created.length }) : t("departures.schedules.partial", { n: r.created.length, date: D.full(r.doneUntil) }));
      return r;
    });
  return (
    <DepDialog
      data-testid="trips-schedule-dialog"
      title={t("departures.schedules.title")}
      busy={busy}
      dirty={form !== null}
      onClose={onClose}
      wide
      footer={
        <>
          {form === null ? (
            <button type="button" data-testid="trips-schedule-add" className={BTN_PRIMARY} disabled={busy || products.length === 0} onClick={() => setForm(blank())}>
              {t("departures.schedules.add")}
            </button>
          ) : null}
          <button type="button" className={BTN} onClick={close}>
            {t("common.close")}
          </button>
        </>
      }
    >
      {form ? (
        <ScheduleForm unitSlug={unitSlug} sched={sched} form={form} setForm={setForm} busy={busy} run={run} />
      ) : (
        <>
          {sched.items.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">{t("departures.schedules.empty")}</p> : null}
          <ul className="flex min-w-0 flex-col gap-2">
            {sched.items.map((s) => (
              <li key={s.scheduleId} data-testid={`trips-schedule-row-${s.scheduleId}`} className={`flex min-w-0 flex-col gap-2 rounded-lg p-3 text-sm ${s.paused ? "border border-dashed border-[color:var(--color-line)] bg-[color:var(--color-surface-2)]" : "border border-[color:var(--color-line)]"}`}>
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <b className="text-[color:var(--color-ink)]">{s.productTitle}</b>
                  {s.optionName ? ` · ${s.optionName}` : ""} · {ruleText(s)} · {s.timeText}
                </div>
                <div className="min-w-0 text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">
                  {[
                    t("departures.schedules.capLine", { cap: s.capacity }),
                    s.minPax !== null ? t("departures.header.minPax", { n: s.minPax }) : null,
                    s.dateTo ? D.range(s.dateFrom, s.dateTo) : t("departures.schedules.noEnd", { from: D.full(s.dateFrom) }),
                    s.resourceNames.length ? s.resourceNames.join(", ") : null,
                    s.generatedUntil ? t("departures.schedules.generatedUntil", { date: D.full(s.generatedUntil) }) : null,
                    s.paused ? t("departures.schedules.paused") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {sched.canEdit ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={BTN} disabled={busy} onClick={() => setForm(fromItem(s))}>
                      {t("common.edit")}
                    </button>
                    <button
                      type="button"
                      data-testid={`trips-schedule-pause-${s.scheduleId}`}
                      className={BTN}
                      disabled={busy}
                      onClick={() => void run(() => (s.paused ? resumeScheduleAction(unitSlug, { scheduleId: s.scheduleId }) : pauseScheduleAction(unitSlug, { scheduleId: s.scheduleId })))}
                    >
                      {s.paused ? t("departures.schedules.resume") : t("departures.schedules.pause")}
                    </button>
                    {!s.paused ? (
                      <button type="button" data-testid={`trips-schedule-materialize-${s.scheduleId}`} className={BTN} disabled={busy} onClick={() => void materialize(s.scheduleId)}>
                        {t("departures.schedules.materialize")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {sched.itemsTruncated ? <p className="text-sm text-[color:var(--color-ink-soft)]">{t("departures.schedules.truncated", { n: sched.items.length })}</p> : null}
        </>
      )}
      {info ? (
        <p role="status" className="rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm text-[color:var(--color-ink)]">
          {info}
        </p>
      ) : null}
      <ErrorLine text={error} />
    </DepDialog>
  );
}

type Runner = ReturnType<typeof useRunner>["run"];
function ScheduleForm({ unitSlug, sched, form, setForm, busy, run }: { unitSlug: string; sched: DepartureSchedulesVM; form: SchedForm; setForm: (f: SchedForm | null) => void; busy: boolean; run: Runner }) {
  const t = useTranslations("trips");
  const products = sched.products.filter((p) => p.options.some((o) => o.active) || p.id === form.productId);
  const prod = products.find((p) => p.id === form.productId);
  const opts = (prod?.options ?? []).filter((o) => o.active || o.id === form.optionId);
  const tm = hmToMin(form.time);
  const c = intOrNull(form.cap);
  const mp = form.minPax.trim() ? intOrNull(form.minPax) : null;
  const ok =
    !!prod &&
    !!form.optionId &&
    tm !== null &&
    c !== null &&
    c > 0 &&
    (form.minPax.trim() === "" || (mp !== null && mp >= 1)) &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.from) &&
    (form.to === "" || (/^\d{4}-\d{2}-\d{2}$/.test(form.to) && form.to >= form.from)) &&
    (form.kind !== "WEEKLY" || form.weekdays.length > 0);
  const rule = form.kind === "DAILY" ? { kind: "DAILY" } : form.kind === "WEEKLY" ? { kind: "WEEKLY", weekdays: [...form.weekdays].sort() } : undefined;
  const save = () =>
    run(
      () =>
        form.scheduleId
          ? updateScheduleAction(unitSlug, {
              scheduleId: form.scheduleId,
              ...(rule ? { rule } : {}),
              departTimeMin: tm,
              capacity: c,
              minPax: form.minPax.trim() ? mp : null,
              resourceIds: form.res,
              dateFrom: form.from,
              dateTo: form.to || null,
            })
          : createScheduleAction(unitSlug, {
              productId: form.productId,
              optionId: form.optionId,
              rule,
              departTimeMin: tm,
              capacity: c,
              ...(form.minPax.trim() ? { minPax: mp } : {}),
              resourceIds: form.res,
              dateFrom: form.from,
              ...(form.to ? { dateTo: form.to } : {}),
            }),
      () => setForm(null),
    );
  const set = (p: Partial<SchedForm>) => setForm({ ...form, ...p });
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="text-sm font-bold text-[color:var(--color-ink)]">{form.scheduleId ? t("departures.schedules.edit") : t("departures.schedules.add")}</h3>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("departures.create.product")}>
          <select
            className={INPUT}
            value={form.productId}
            disabled={form.scheduleId !== null}
            onChange={(e) => {
              const p = products.find((x) => x.id === e.target.value);
              const o = p?.options.find((x) => x.active);
              set({ productId: e.target.value, optionId: o?.id ?? "", time: minToHm(o?.departTimeMin ?? null), cap: o?.capacity != null ? String(o.capacity) : "", res: o?.resourceIds ?? [] });
            }}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titleTh}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("departures.create.option")}>
          <select className={INPUT} value={form.optionId} disabled={form.scheduleId !== null} onChange={(e) => set({ optionId: e.target.value })}>
            {opts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nameTh}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("departures.schedules.kind")}>
          <select className={INPUT} value={form.kind} onChange={(e) => set({ kind: e.target.value === "WEEKLY" ? "WEEKLY" : e.target.value === "KEEP" ? "KEEP" : "DAILY" })}>
            <option value="DAILY">{t("departures.schedules.rule.DAILY")}</option>
            <option value="WEEKLY">{t("departures.schedules.rule.WEEKLY")}</option>
            {form.kind === "KEEP" ? <option value="KEEP">{t("departures.schedules.rule.DATES")}</option> : null}
          </select>
        </Field>
        <Field label={t("departures.create.time")}>
          <input type="time" className={INPUT} value={form.time} onChange={(e) => set({ time: e.target.value })} />
        </Field>
        {form.kind === "WEEKLY" ? (
          <fieldset className="flex min-w-0 flex-col gap-1 sm:col-span-2">
            <legend className="mb-1 text-sm font-medium text-[color:var(--color-ink)]">{t("departures.schedules.weekdays")}</legend>
            <div className="flex flex-wrap gap-1">
              {WEEK_ORDER.map((w) => {
                const on = form.weekdays.includes(w);
                return (
                  <button key={w} type="button" aria-pressed={on} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-sm ${on ? "border-2 border-[color:var(--color-ink)] font-bold" : "border border-[color:var(--color-line)]"}`} onClick={() => set({ weekdays: on ? form.weekdays.filter((x) => x !== w) : [...form.weekdays, w] })}>
                    {t(`dates.wd${w}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <Field label={t("departures.create.capacity")}>
          <input inputMode="numeric" className={INPUT} value={form.cap} onChange={(e) => set({ cap: e.target.value.replace(/[^\d]/g, "") })} />
        </Field>
        <Field label={t("departures.create.minPax")} hint={t("departures.create.minPaxHint")}>
          <input inputMode="numeric" className={INPUT} value={form.minPax} onChange={(e) => set({ minPax: e.target.value.replace(/[^\d]/g, "") })} />
        </Field>
        <Field label={t("departures.schedules.from")}>
          <input type="date" className={INPUT} value={form.from} onChange={(e) => set({ from: e.target.value })} />
        </Field>
        <Field label={t("departures.schedules.to")} hint={t("departures.schedules.toHint")}>
          <input type="date" className={INPUT} value={form.to} onChange={(e) => set({ to: e.target.value })} />
        </Field>
      </div>
      <ResourcePicker resources={sched.resources} value={form.res} onChange={(v) => set({ res: v })} />
      <p className="text-sm text-[color:var(--color-muted)]">{t("departures.schedules.exceptionsNote")}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN_PRIMARY} disabled={busy || !ok} onClick={() => void save()}>
          {t("common.save")}
        </button>
        <button type="button" className={BTN} disabled={busy} onClick={() => setForm(null)}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
