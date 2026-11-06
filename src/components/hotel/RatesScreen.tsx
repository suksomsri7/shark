"use client";
// SVC H.1 ▸ จอราคาโรงแรม (ภาพ ledger/design-dorm/15-hotel-rates.png · ใบสั่ง h.1 §5)
//   แท็บย่อย 4: ปฏิทินราคา (ประเภท × 14 วัน · ราคา + เหลือขาย · ช่องแก้มือไฮไลต์) · แผนราคา · ฤดู/วันพิเศษ · กติกา
//   • สิทธิ์อ่านอย่างเดียว (canWrite = false) ⇒ ไม่มีปุ่มเขียน และช่องราคากดไม่ได้ (ไม่ใช่แค่ถูกปฏิเสธตอนกด)
//   • มือถือ 390: ตารางอยู่ในกรอบเลื่อนแนวนอน + ตัวบอก data-scroll-hint
//   • ข้อมูลทั้งหมดมาจากโมเดลฝั่งเซิร์ฟเวอร์ (loadRatesScreen) · บันทึกผ่าน action ที่หน้าผูก unitSlug ไว้แล้ว
import { useMemo, useState } from "react";
import type { MatrixRow, RatePlanDto, RatesScreenModel, SeasonDto } from "@/lib/modules/hotel";
import {
  DEPOSIT_KIND_TH,
  RATES_TABS,
  THAI_HOLIDAYS,
  VISIBILITY_TH,
  cancelRulesTh,
  dateTh,
  dayOfMonth,
  depositTh,
  dowNameTh,
  dowOfYmd,
  dowShortTh,
  isLow,
  moneyTh,
  parseBaht,
  planSummaryTh,
  rangeTh,
  seasonRangeTh,
  taxNoteTh,
  visibilityTh,
  type RatesActionResult,
  type RatesActions,
  type RatesTabKey,
} from "./rates-shared";

type Props = { model: RatesScreenModel; unitSlug: string; tab: RatesTabKey; canWrite: boolean; actions: RatesActions };
type Runner = { (): Promise<RatesActionResult> };
type RunFn = { (fn: Runner, ok: string): Promise<void> };
type Notice = { tone: "ok" | "err"; text: string } | null;
type OverrideDraft = { roomTypeId: string; date: string; dateTo: string; price: string; reason: string; ratePlanId: string };

const BTN = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm";
const BTN_PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-bold text-white";
const INPUT = "min-h-11 w-full rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 py-2 text-sm";
const CARD = "flex min-w-0 flex-col gap-2 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5";
const resultText = (r: RatesActionResult, ok: string): Notice => (r.ok ? { tone: "ok", text: ok } : { tone: "err", text: r.reason || "บันทึกไม่สำเร็จ" });

export default function RatesScreen({ model, unitSlug, tab, canWrite, actions }: Props) {
  const [notice, setNotice] = useState(null as Notice);
  const [busy, setBusy] = useState(false);
  const base = `/app/u/${unitSlug}/hotel`;
  const run: RunFn = async (fn, ok) => {
    if (busy) return;
    setBusy(true);
    try {
      setNotice(resultText(await fn(), ok));
    } catch {
      setNotice({ tone: "err", text: "เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-hotel-rates="" data-tab={tab} className="flex w-full min-w-0 flex-col gap-4">
      <header className="flex min-w-0 flex-col gap-1">
        <h1 className="text-xl font-bold text-[color:var(--color-ink)]">ราคา</h1>
        <p data-tax-note={model.tax.mode} className="text-sm text-[color:var(--color-muted)]">
          {taxNoteTh(model.tax)}
        </p>
      </header>
      <nav aria-label="หมวดราคา" className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1">
        {RATES_TABS.map((t) => (
          <a
            key={t.key}
            href={ratesHref(base, t.key, model.selectedPlanId)}
            data-rates-tab={t.key}
            aria-current={t.key === tab ? "page" : undefined}
            className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm ${t.key === tab ? "bg-[color:var(--color-surface-2)] font-bold text-[color:var(--color-ink)]" : "text-[color:var(--color-ink-soft)]"}`}
          >
            {t.labelTh}
          </a>
        ))}
      </nav>
      {notice ? (
        <p role={notice.tone === "err" ? "alert" : "status"} className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm" style={{ color: notice.tone === "err" ? "var(--color-danger)" : "var(--color-ink)" }}>
          {notice.text}
        </p>
      ) : null}
      {tab === "calendar" ? <CalendarTab model={model} canWrite={canWrite} actions={actions} run={run} busy={busy} /> : null}
      {tab === "plans" ? <PlansTab model={model} canWrite={canWrite} actions={actions} run={run} busy={busy} /> : null}
      {tab === "seasons" ? <SeasonsTab model={model} canWrite={canWrite} actions={actions} run={run} busy={busy} /> : null}
      {tab === "rules" ? <RulesTab model={model} base={base} settingsHref={`/app/u/${unitSlug}/hotel/settings`} /> : null}
    </div>
  );
}

type TabProps = { model: RatesScreenModel; canWrite: boolean; actions: RatesActions; run: RunFn; busy: boolean };

// ───────────────────────── ปฏิทินราคา ─────────────────────────
function CalendarTab({ model, canWrite, actions, run, busy }: TabProps) {
  const [draft, setDraft] = useState(null as OverrideDraft | null);
  const days = model.preview.days;
  const types = model.preview.roomTypes;
  const planName = model.plans.find((p) => p.id === model.preview.ratePlanId)?.name ?? "ยังไม่มีแผนราคา";
  const weekend = new Set(model.rules.weekendDays);
  // m10 ▸ เปิดช่องที่มีแก้มือ ⇒ ไดอะล็อกตั้งแผนตามแถวแก้มือจริง (เฉพาะแผนนี้ก่อน ไม่มีแล้วค่อยทุกแผน) — ล้างได้ตรงแถว ◂
  const open = (roomTypeId: string, date: string, priceSatang: number | null) => {
    const ov = overrideAt(model, roomTypeId, date);
    setDraft({ roomTypeId, date, dateTo: date, price: priceSatang === null ? "" : String(priceSatang / 100), reason: ov?.reason ?? "", ratePlanId: ov?.ratePlanId ?? "" });
  };
  const save = () => {
    if (!draft) return;
    const price = parseBaht(draft.price);
    if (price === null) {
      void run(async () => ({ ok: false, reason: "ใส่ราคาเป็นตัวเลข เช่น 1290" }), "");
      return;
    }
    void run(() => actions.setOverride({ roomTypeId: draft.roomTypeId, ratePlanId: draft.ratePlanId || null, date: draft.date, dateTo: draft.dateTo, priceSatang: price, reason: draft.reason }), "ตั้งราคาแก้มือแล้ว").then(() => setDraft(null));
  };
  const clear = () => {
    if (!draft) return;
    void run(() => actions.clearOverride({ roomTypeId: draft.roomTypeId, ratePlanId: draft.ratePlanId || null, date: draft.date, dateTo: draft.dateTo }), "ล้างราคาแก้มือแล้ว — กลับไปใช้ราคาตาราง").then(() => setDraft(null));
  };
  return (
    <section className={CARD}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-[color:var(--color-ink)]">{rangeTh(model.from, model.to)}</h2>
          <p className="text-xs text-[color:var(--color-muted)]">{`ราคาของแผน ${planName} · ช่องกรอบสี = แก้มือ`}</p>
        </div>
        <PlanPicker model={model} base={`/app/u/${model.unitSlug}/hotel`} tab="calendar" />
        {canWrite ? (
          <button type="button" className={BTN} disabled={busy || !types.length} onClick={() => types.length && setDraft({ roomTypeId: types[0].id, date: model.from, dateTo: model.to, price: "", reason: "", ratePlanId: "" })}>
            ปรับราคาหลายวัน
          </button>
        ) : null}
      </div>
      {types.length ? null : <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีประเภทห้อง — เพิ่มที่ ตั้งค่าห้องพัก ก่อน</p>}
      <div data-scroll-hint="" className="min-w-0 overflow-x-auto">
        <table data-rate-grid="" className="w-full min-w-[960px] border-collapse text-center text-sm tabular-nums">
          <thead>
            <tr className="bg-[color:var(--color-surface-2)] text-xs text-[color:var(--color-muted)]">
              <th className="w-48 px-3 py-2 text-left">ประเภทห้อง</th>
              {days.map((d) => (
                <th key={d.date} data-weekend={weekend.has(dowOfYmd(d.date)) ? "true" : "false"} className={`px-1 py-2 ${d.date === model.today ? "text-[color:var(--color-accent)]" : ""}`}>
                  {dowShortTh(d.date)}
                  <b className="block text-base text-[color:var(--color-ink)]">{dayOfMonth(d.date)}</b>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <RateRows key={t.id} typeId={t.id} name={t.name} sellable={t.sellable} planName={planName} days={days} canWrite={canWrite} onCell={open} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[color:var(--color-muted)] sm:hidden">เลื่อนดูวันถัดไป →</p>
      {draft && canWrite ? (
        <div role="dialog" aria-modal="true" aria-label="แก้ราคารายวัน" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="flex w-full max-w-md flex-col gap-3 rounded-t-2xl bg-[color:var(--color-surface)] p-5 sm:rounded-2xl">
            <h3 className="text-base font-bold">แก้ราคารายวัน</h3>
            <label className="flex flex-col gap-1 text-sm">
              ประเภทห้อง
              <select className={INPUT} value={draft.roomTypeId} onChange={(e) => setDraft({ ...draft, roomTypeId: e.target.value })}>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm">
                ตั้งแต่วันที่
                <input type="date" className={INPUT} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                ถึงวันที่
                <input type="date" className={INPUT} value={draft.dateTo} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              ใช้กับแผน
              <select className={INPUT} value={draft.ratePlanId} onChange={(e) => setDraft({ ...draft, ratePlanId: e.target.value })}>
                <option value="">ทุกแผน</option>
                {model.plans
                  .filter((p) => p.status === "ACTIVE")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              ราคาต่อคืน (บาท)
              <input inputMode="decimal" className={INPUT} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              เหตุผล
              <input className={INPUT} maxLength={200} value={draft.reason} placeholder="เช่น งานวิ่งในเมือง" onChange={(e) => setDraft({ ...draft, reason: e.target.value })} />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={BTN} onClick={() => setDraft(null)}>
                ปิด
              </button>
              <button type="button" className={BTN} disabled={busy} onClick={clear}>
                ล้างแก้มือ
              </button>
              <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={save}>
                บันทึก
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function RateRows({
  typeId,
  name,
  sellable,
  planName,
  days,
  canWrite,
  onCell,
}: {
  typeId: string;
  name: string;
  sellable: number;
  planName: string;
  days: RatesScreenModel["preview"]["days"];
  canWrite: boolean;
  onCell: (roomTypeId: string, date: string, priceSatang: number | null) => void;
}) {
  return (
    <>
      <tr className="border-t border-[color:var(--color-line)] font-semibold">
        <td className="px-3 py-3 text-left">
          {name}
          <small className="block text-xs font-normal text-[color:var(--color-muted)]">{`${planName} · ${sellable} ห้องขาย`}</small>
        </td>
        {days.map((d) => {
          const c = d.byType[typeId];
          const ov = c?.source === "OVERRIDE";
          const label = c && c.priceSatang !== null ? moneyTh(c.priceSatang) : "—";
          const cls = `px-1 py-3 ${ov ? "bg-[color:var(--color-accent-soft)] font-bold text-[color:var(--color-accent)] ring-2 ring-inset ring-[color:var(--color-accent)]" : ""}`;
          return (
            <td key={d.date} data-source={c?.source ?? "NONE"} data-override={ov ? "true" : undefined} className={cls}>
              {canWrite ? (
                <button type="button" className="min-h-11 w-full" aria-label={`แก้ราคา ${name} ${dateTh(d.date)}`} onClick={() => onCell(typeId, d.date, c?.priceSatang ?? null)}>
                  {label}
                </button>
              ) : (
                <span>{label}</span>
              )}
              {ov ? <small className="block text-[11px] font-semibold">แก้มือ</small> : null}
            </td>
          );
        })}
      </tr>
      <tr className="text-xs text-[color:var(--color-muted)]">
        <td className="px-3 pb-2 text-left">เหลือขาย</td>
        {days.map((d) => {
          const c = d.byType[typeId];
          const full = !c || c.remaining === 0;
          return (
            <td key={d.date} data-remaining={c?.remaining ?? 0} className={`pb-2 ${full ? "font-bold text-[color:var(--color-danger)]" : c && isLow(c.remaining, c.total) ? "font-bold text-[color:var(--color-ink)]" : ""}`}>
              {c && c.remaining > 0 ? c.remaining : "เต็ม"}
            </td>
          );
        })}
      </tr>
    </>
  );
}

// ───────────────────────── แผนราคา ─────────────────────────
type RuleDraft = { daysBefore: string; refundPct: string };
type PlanDraft = { id: string; code: string; name: string; includeBreakfast: boolean; depositKind: string; depositValue: string; visibility: string[]; minNights: string; rules: RuleDraft[] };
const emptyPlan = (): PlanDraft => ({ id: "", code: "", name: "", includeBreakfast: false, depositKind: "FIRST_NIGHT", depositValue: "", visibility: ["WEB", "LINE", "COUNTER"], minNights: "", rules: [] });

function PlansTab({ model, canWrite, actions, run, busy }: TabProps) {
  const [draft, setDraft] = useState(null as PlanDraft | null);
  const save = () => {
    if (!draft) return;
    const isPct = draft.depositKind === "PERCENT";
    const val = draft.depositKind === "FIXED_AMOUNT" ? parseBaht(draft.depositValue || "0") : isPct ? Math.round(Number(draft.depositValue || "0") * 100) : 0;
    const input = {
      ...(draft.id ? { id: draft.id } : {}),
      code: draft.code,
      name: draft.name,
      includeBreakfast: draft.includeBreakfast,
      depositKind: draft.depositKind,
      depositValue: val ?? -1,
      visibility: draft.visibility,
      minNights: draft.minNights ? Number(draft.minNights) : null,
    };
    const rules = draft.rules
      .filter((r) => r.daysBefore.trim() !== "")
      .map((r) => ({ daysBefore: Number(r.daysBefore), refundBp: Math.round(Number(r.refundPct || "0") * 100) }));
    // M3 ▸ บันทึกแผนก่อน แล้วตั้งขั้นบันไดยกเลิกของแผนนั้น (แทนทั้งชุด · ชุดว่าง = ใช้ค่าตั้งโรงแรม) ◂
    void run(async () => {
      const r = await actions.saveRatePlan(input);
      const id = r.plan?.id ?? draft.id;
      if (!r.ok || !id) return r;
      return actions.saveCancelRules({ ratePlanId: id, rules });
    }, "บันทึกแผนราคาแล้ว").then(() => setDraft(null));
  };
  const active = activePlans(model.plans);
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">แผนราคา (คิดจากราคามาตรฐาน)</h2>
        {canWrite ? (
          <button type="button" className={BTN} onClick={() => setDraft(emptyPlan())}>
            + เพิ่มแผน
          </button>
        ) : null}
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.map((p) => (
          <PlanCard key={p.id} plan={p} canWrite={canWrite} busy={busy} onEdit={() => setDraft(planDraftOf(p))} onArchive={() => void run(() => actions.archiveRatePlan({ id: p.id }), "เก็บแผนเข้าคลังแล้ว")} />
        ))}
      </div>
      {model.matrix ? <MatrixEditor model={model} canWrite={canWrite} actions={actions} run={run} busy={busy} /> : null}
      {draft && canWrite ? (
        <div role="dialog" aria-modal="true" aria-label="แผนราคา" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-2xl bg-[color:var(--color-surface)] p-5 sm:rounded-2xl">
            <h3 className="text-base font-bold">{draft.id ? "แก้แผนราคา" : "เพิ่มแผนราคา"}</h3>
            <label className="flex flex-col gap-1 text-sm">
              ชื่อแผน
              <input className={INPUT} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              รหัสแผน (อักษรอังกฤษ/ตัวเลข)
              <input className={INPUT} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
            </label>
            <label className="inline-flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={draft.includeBreakfast} onChange={(e) => setDraft({ ...draft, includeBreakfast: e.target.checked })} />
              รวมอาหารเช้า
            </label>
            <label className="flex flex-col gap-1 text-sm">
              มัดจำ
              <select className={INPUT} value={draft.depositKind} onChange={(e) => setDraft({ ...draft, depositKind: e.target.value })}>
                {Object.entries(DEPOSIT_KIND_TH).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {draft.depositKind === "PERCENT" || draft.depositKind === "FIXED_AMOUNT" ? (
              <label className="flex flex-col gap-1 text-sm">
                {draft.depositKind === "PERCENT" ? "เปอร์เซ็นต์ของยอด" : "จำนวนเงิน (บาท)"}
                <input inputMode="decimal" className={INPUT} value={draft.depositValue} onChange={(e) => setDraft({ ...draft, depositValue: e.target.value })} />
              </label>
            ) : null}
            <fieldset className="flex flex-wrap gap-3 text-sm">
              <legend className="mb-1">ช่องทางขาย</legend>
              {Object.entries(VISIBILITY_TH).map(([k, v]) => (
                <label key={k} className="inline-flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={draft.visibility.includes(k)}
                    onChange={(e) => setDraft({ ...draft, visibility: e.target.checked ? [...draft.visibility, k] : draft.visibility.filter((x) => x !== k) })}
                  />
                  {v}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1 text-sm">
              ขั้นต่ำคืน (เว้นว่าง = ไม่กำหนด)
              <input inputMode="numeric" className={INPUT} value={draft.minNights} onChange={(e) => setDraft({ ...draft, minNights: e.target.value })} />
            </label>
            <fieldset data-cancel-rules="" className="flex flex-col gap-2 text-sm">
              <legend className="mb-1">ขั้นบันไดยกเลิก (ไม่ตั้ง = ใช้ค่าตั้งโรงแรม)</legend>
              {draft.rules.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <label className="flex flex-col gap-1">
                    ยกเลิกก่อน (วัน)
                    <input inputMode="numeric" className={INPUT} value={r.daysBefore} onChange={(e) => setDraft({ ...draft, rules: setRule(draft.rules, i, { daysBefore: e.target.value }) })} />
                  </label>
                  <label className="flex flex-col gap-1">
                    คืนเงิน (%)
                    <input inputMode="decimal" className={INPUT} value={r.refundPct} onChange={(e) => setDraft({ ...draft, rules: setRule(draft.rules, i, { refundPct: e.target.value }) })} />
                  </label>
                  <button type="button" className={BTN} onClick={() => setDraft({ ...draft, rules: draft.rules.filter((_, j) => j !== i) })}>
                    ลบ
                  </button>
                </div>
              ))}
              <button type="button" className={BTN} onClick={() => setDraft({ ...draft, rules: [...draft.rules, { daysBefore: "", refundPct: "" }] })}>
                + เพิ่มขั้น
              </button>
            </fieldset>
            <div className="flex justify-end gap-2">
              <button type="button" className={BTN} onClick={() => setDraft(null)}>
                ปิด
              </button>
              <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={save}>
                บันทึก
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** ลิงก์แท็บย่อย (คงแผนที่เลือก) */
function ratesHref(base: string, tab: RatesTabKey, planId: string | null): string {
  const q = [tab === "calendar" ? "" : `tab=${tab}`, planId ? `plan=${planId}` : ""].filter(Boolean).join("&");
  return q ? `${base}/rates?${q}` : `${base}/rates`;
}
/** แก้มือที่ช่อง (ประเภท, วัน) ใช้จริงกับแผนที่ดู: เฉพาะแผนก่อน แล้วทุกแผน */
function overrideAt(model: RatesScreenModel, roomTypeId: string, date: string): RatesScreenModel["overrides"][number] | undefined {
  const at = model.overrides.filter((o) => o.roomTypeId === roomTypeId && o.date === date);
  return at.find((o) => o.ratePlanId === model.selectedPlanId) ?? at.find((o) => o.ratePlanId === null);
}
function setRule(rules: RuleDraft[], i: number, patch: Partial<RuleDraft>): RuleDraft[] {
  return rules.map((r, j) => (j === i ? { ...r, ...patch } : r));
}
/** วันหยุดไทยของปี จัดกลุ่มตามชื่อ */
function holidayGroups(year: string): [string, string[]][] {
  const m = new Map([] as [string, string[]][]);
  for (const h of THAI_HOLIDAYS) m.set(h.name, [...(m.get(h.name) ?? []), `${year}-${h.date}`]);
  return [...m.entries()];
}

/** เลือกแผนที่ดู (M2) — เปลี่ยนแล้วโหลดหน้าใหม่ด้วย ?plan= */
function PlanPicker({ model, base, tab }: { model: RatesScreenModel; base: string; tab: RatesTabKey }) {
  const plans = activePlans(model.plans);
  if (plans.length === 0) return null;
  return (
    <label className="flex items-center gap-2 text-sm">
      แผนที่ดู
      <select data-plan-picker="" className={INPUT} value={model.selectedPlanId ?? ""} onChange={(e) => window.location.assign(ratesHref(base, tab, e.target.value))}>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function activePlans(plans: RatePlanDto[]): RatePlanDto[] {
  return plans.filter((p) => p.status === "ACTIVE");
}

const planDraftOf = (p: RatePlanDto): PlanDraft => ({
  id: p.id,
  code: p.code,
  name: p.name,
  includeBreakfast: p.includeBreakfast,
  depositKind: p.depositKind,
  depositValue: p.depositKind === "FIXED_AMOUNT" ? String(p.depositValue / 100) : p.depositKind === "PERCENT" ? String(p.depositValue / 100) : "",
  visibility: [...p.visibility],
  minNights: p.minNights ? String(p.minNights) : "",
  rules: p.cancelRules.map((r) => ({ daysBefore: String(r.daysBefore), refundPct: String(r.refundBp / 100) })),
});

function PlanCard({ plan, canWrite, busy, onEdit, onArchive }: { plan: RatePlanDto; canWrite: boolean; busy: boolean; onEdit: () => void; onArchive: () => void }) {
  return (
    <article data-plan={plan.code} className={CARD}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h3 className="min-w-0 text-base font-bold text-[color:var(--color-ink)]">{plan.name}</h3>
        {plan.isDefault ? <span className="rounded-lg border border-[color:var(--color-line)] px-2 py-1 text-xs">แผนเริ่มต้น</span> : null}
      </div>
      <p className="text-sm text-[color:var(--color-ink-soft)]">{planSummaryTh(plan)}</p>
      <p className="text-xs text-[color:var(--color-muted)]">{`ช่องทาง: ${visibilityTh(plan.visibility)}`}</p>
      <p className="text-xs text-[color:var(--color-muted)]">{`ยกเลิก: ${cancelRulesTh(plan.cancelRules)} · ${depositTh(plan.depositKind, plan.depositValue)}`}</p>
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN} onClick={onEdit}>
            แก้
          </button>
          {plan.isDefault ? null : (
            <button type="button" className={BTN} disabled={busy} onClick={onArchive}>
              เก็บเข้าคลัง
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}

/** ตารางราคาของแผนเริ่มต้น: ประเภท × (ราคาปกติ + ฤดู) — ราคาธรรมดา/สุดสัปดาห์/วันหยุด */
function MatrixEditor({ model, canWrite, actions, run, busy }: TabProps) {
  const rows = model.matrix?.rows ?? [];
  const [vals, setVals] = useState(() => initialVals(rows));
  const typeName = new Map(model.preview.roomTypes.map((t) => [t.id, t.name] as const));
  const seasonName = new Map(model.seasons.map((s: SeasonDto) => [s.id, s.name] as const));
  const save = () => {
    const out: Record<string, unknown>[] = [];
    for (const r of rows) {
      const v = vals[cellKey(r)] ?? ["", "", ""];
      const wd = v[0].trim() ? parseBaht(v[0]) : null;
      const we = v[1].trim() ? parseBaht(v[1]) : null;
      const hol = v[2].trim() ? parseBaht(v[2]) : null;
      out.push({ roomTypeId: r.roomTypeId, seasonId: r.seasonId, priceWeekdaySatang: wd ?? (v[0].trim() ? -1 : null), priceWeekendSatang: we ?? (v[1].trim() ? -1 : null), priceHolidaySatang: hol ?? (v[2].trim() ? -1 : null) });
    }
    void run(() => actions.saveRates({ ratePlanId: model.matrix?.ratePlanId, rows: out }), "บันทึกตารางราคาแล้ว");
  };
  return (
    <section className={CARD}>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold">{`ตารางราคา · ${model.plans.find((p) => p.id === model.matrix?.ratePlanId)?.name ?? "แผนราคา"} (บาทต่อคืน)`}</h3>
        <PlanPicker model={model} base={`/app/u/${model.unitSlug}/hotel`} tab="plans" />
      </div>
      <div data-scroll-hint="" className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm tabular-nums">
          <thead>
            <tr className="bg-[color:var(--color-surface-2)] text-xs text-[color:var(--color-muted)]">
              <th className="px-2 py-2 text-left">ประเภทห้อง</th>
              <th className="px-2 py-2 text-left">ช่วง</th>
              <th className="px-2 py-2">วันธรรมดา</th>
              <th className="px-2 py-2">สุดสัปดาห์</th>
              <th className="px-2 py-2">วันหยุด</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const k = cellKey(r);
              const v = vals[k] ?? ["", "", ""];
              return (
                <tr key={k} className="border-t border-[color:var(--color-line)]">
                  <td className="px-2 py-2">{typeName.get(r.roomTypeId) ?? "—"}</td>
                  <td className="px-2 py-2">{r.seasonId ? (seasonName.get(r.seasonId) ?? "ฤดู") : "ราคาปกติ"}</td>
                  {[0, 1, 2].map((i) => (
                    <td key={i} className="px-1 py-1">
                      {canWrite ? (
                        <input
                          inputMode="decimal"
                          aria-label="ราคา"
                          className={INPUT}
                          value={v[i]}
                          onChange={(e) => setVals({ ...vals, [k]: v.map((x, j) => (j === i ? e.target.value : x)) as [string, string, string] })}
                        />
                      ) : (
                        <span className="block text-center">{v[i] || "—"}</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canWrite ? (
        <div className="flex justify-end">
          <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={save}>
            บันทึกตารางราคา
          </button>
        </div>
      ) : null}
    </section>
  );
}
type Triple = [string, string, string];
function initialVals(rows: MatrixRow[]): { [k: string]: Triple } {
  const out: { [k: string]: Triple } = {};
  for (const r of rows) out[cellKey(r)] = cellText(r);
  return out;
}
const cellKey = (r: MatrixRow): string => `${r.roomTypeId}|${r.seasonId ?? ""}`;
const bahtInput = (v: number | null): string => (v === null ? "" : moneyTh(v).replace(/,/g, ""));
const cellText = (r: MatrixRow): [string, string, string] => [bahtInput(r.priceWeekdaySatang), bahtInput(r.priceWeekendSatang), bahtInput(r.priceHolidaySatang)];

// ───────────────────────── ฤดู · วันพิเศษ ─────────────────────────
type SeasonDraft = { id: string; name: string; dateStart: string; dateEnd: string; priority: string; minNights: string };

function SeasonsTab({ model, canWrite, actions, run, busy }: TabProps) {
  const [draft, setDraft] = useState(null as SeasonDraft | null);
  const [hol, setHol] = useState({ date: "", name: "" });
  const year = model.from.slice(0, 4);
  const seasons = model.seasons.filter((s) => s.status === "ACTIVE");
  const save = () => {
    if (!draft) return;
    const input = {
      ...(draft.id ? { id: draft.id } : {}),
      name: draft.name,
      dateStart: draft.dateStart,
      dateEnd: draft.dateEnd,
      priority: Number(draft.priority || "0"),
      minNights: draft.minNights ? Number(draft.minNights) : null,
    };
    void run(() => actions.saveSeason(input), "บันทึกฤดูแล้ว").then(() => setDraft(null));
  };
  const useThai = () =>
    void run(async () => {
      // m9 ▸ จัดกลุ่มตามชื่อก่อน (สงกรานต์ 3 วัน = ครั้งเดียว) ◂
      for (const [name, dates] of holidayGroups(year)) {
        const r = await actions.saveHolidays({ dates, name });
        if (!r.ok) return r;
      }
      return { ok: true };
    }, `เพิ่มวันหยุดไทยปี ${Number(year) + 543} แล้ว`);
  return (
    <section className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
      <div className={CARD}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">ฤดู (เรียงตามลำดับความสำคัญ)</h2>
          {canWrite ? (
            <button type="button" className={BTN} onClick={() => setDraft({ id: "", name: "", dateStart: model.from, dateEnd: model.to, priority: "10", minNights: "" })}>
              + เพิ่มฤดู
            </button>
          ) : null}
        </div>
        {seasons.length ? null : <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีฤดู — ทุกวันใช้ราคาปกติ</p>}
        <ul className="flex flex-col gap-2">
          {seasons.map((s) => (
            <li key={s.id} data-season={s.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm">
              <span className="min-w-0">
                <b>{s.name}</b>
                <span className="block text-xs text-[color:var(--color-muted)]">{`${seasonRangeTh(s)} · ลำดับ ${s.priority}${s.minNights ? ` · ขั้นต่ำ ${s.minNights} คืน` : ""}`}</span>
              </span>
              {canWrite ? (
                <span className="flex gap-2">
                  <button type="button" className={BTN} onClick={() => setDraft({ id: s.id, name: s.name, dateStart: s.dateStart, dateEnd: s.dateEnd, priority: String(s.priority), minNights: s.minNights ? String(s.minNights) : "" })}>
                    แก้
                  </button>
                  <button type="button" className={BTN} disabled={busy} onClick={() => void run(() => actions.archiveSeason({ id: s.id }), "เก็บฤดูเข้าคลังแล้ว")}>
                    เก็บเข้าคลัง
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <div className={CARD}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold">วันพิเศษ · วันหยุดนักขัตฤกษ์</h2>
          {canWrite ? (
            <button type="button" className={BTN} disabled={busy} onClick={useThai}>
              ใช้ปฏิทินวันหยุดไทย
            </button>
          ) : null}
        </div>
        <p className="text-xs text-[color:var(--color-muted)]">วันหยุดใช้ช่องราคาวันหยุดของตาราง (ไม่ตั้ง = ใช้ราคาตามวันในสัปดาห์)</p>
        <ul className="flex flex-col gap-1">
          {model.holidays.map((h) => (
            <li key={h.date} className="flex min-w-0 items-center justify-between gap-2 border-b border-[color:var(--color-line)] py-1 text-sm">
              <span>{`${dateTh(h.date, true)} · ${h.name}`}</span>
              {canWrite ? (
                <button type="button" className="min-h-11 px-2 text-sm text-[color:var(--color-danger)]" disabled={busy} onClick={() => void run(() => actions.removeHoliday({ date: h.date }), "ลบวันหยุดแล้ว")}>
                  ลบ
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {canWrite ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              วันที่
              <input type="date" className={INPUT} value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              ชื่อวัน
              <input className={INPUT} value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} />
            </label>
            <button type="button" className={BTN} disabled={busy} onClick={() => void run(() => actions.saveHolidays({ dates: [hol.date], name: hol.name }), "เพิ่มวันหยุดแล้ว")}>
              เพิ่มวัน
            </button>
          </div>
        ) : null}
      </div>
      {draft && canWrite ? (
        <div role="dialog" aria-modal="true" aria-label="ฤดู" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="flex w-full max-w-md flex-col gap-3 rounded-t-2xl bg-[color:var(--color-surface)] p-5 sm:rounded-2xl">
            <h3 className="text-base font-bold">{draft.id ? "แก้ฤดู" : "เพิ่มฤดู"}</h3>
            <label className="flex flex-col gap-1 text-sm">
              ชื่อฤดู
              <input className={INPUT} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm">
                เริ่ม
                <input type="date" className={INPUT} value={draft.dateStart} onChange={(e) => setDraft({ ...draft, dateStart: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                สิ้นสุด (รวมวันนี้)
                <input type="date" className={INPUT} value={draft.dateEnd} onChange={(e) => setDraft({ ...draft, dateEnd: e.target.value })} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm">
                ลำดับความสำคัญ
                <input inputMode="numeric" className={INPUT} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                ขั้นต่ำคืน
                <input inputMode="numeric" className={INPUT} value={draft.minNights} onChange={(e) => setDraft({ ...draft, minNights: e.target.value })} />
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className={BTN} onClick={() => setDraft(null)}>
                ปิด
              </button>
              <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={save}>
                บันทึก
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ───────────────────────── กติกา ─────────────────────────
const ROUNDING_TH: Record<string, string> = { SATANG: "ไม่ปัด (เก็บสตางค์)", BAHT_HALF_UP: "ปัดเป็นบาท (ครึ่งขึ้น)", BAHT_DOWN: "ปัดเศษทิ้งเป็นบาท" };

function planNameMap(plans: RatePlanDto[]): Map<string, string> {
  const m = new Map([] as [string, string][]);
  for (const p of plans) m.set(p.id, p.name);
  return m;
}
function weekendTextOf(days: number[]): string {
  return days.map(dowNameTh).join(" · ") || "ไม่มีวันสุดสัปดาห์";
}

function RulesTab({ model, base, settingsHref }: { model: RatesScreenModel; base: string; settingsHref: string }) {
  const planName = planNameMap(model.plans);
  const weekendText = weekendTextOf(model.rules.weekendDays);
  return (
    <section className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
      <div className={CARD}>
        <h2 className="text-base font-bold">กติกาทั้งโรงแรม</h2>
        <dl className="grid grid-cols-1 gap-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-[color:var(--color-muted)]">คิดราคาสุดสัปดาห์วัน</dt>
            <dd>{weekendText}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[color:var(--color-muted)]">วิธีปัดเศษ</dt>
            <dd>{ROUNDING_TH[model.rules.rounding] ?? "ไม่ปัด"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[color:var(--color-muted)]">จองล่วงหน้าได้</dt>
            <dd>{`${model.rules.maxAdvanceBookingDays} วัน`}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-[color:var(--color-muted)]">ภาษี</dt>
            <dd>{taxNoteTh(model.tax)}</dd>
          </div>
        </dl>
        <a href={settingsHref} className="text-sm font-bold text-[color:var(--color-accent)]">
          แก้ที่ ตั้งค่าโรงแรม ›
        </a>
      </div>
      <div className={CARD}>
        <h2 className="text-base font-bold">ขั้นต่ำคืน · ปิดขายวันเข้า (ต่อแผน)</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {model.rules.planRules.map((r) => (
            <li key={r.ratePlanId} className="flex justify-between gap-2 border-b border-[color:var(--color-line)] py-1">
              <span>{planName.get(r.ratePlanId) ?? "แผน"}</span>
              <span>{`${r.minNights ? `ขั้นต่ำ ${r.minNights} คืน` : "ไม่กำหนดขั้นต่ำ"} · ${r.closedToArrival ? "ปิดรับเช็กอิน" : "เปิดรับเช็กอิน"}`}</span>
            </li>
          ))}
        </ul>
        <a href={`${base}/settings?scope=RATE_PLAN`} className="text-sm font-bold text-[color:var(--color-accent)]">
          ตั้งเฉพาะแผนราคา ›
        </a>
      </div>
    </section>
  );
}
