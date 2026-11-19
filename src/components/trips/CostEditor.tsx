"use client";
// TRIPS T1.7a1 ▸ ตัวแก้ต้นทุนของรอบ (ใบสั่ง T1.7 §5.2 · §6) + รายการอ่านอย่างเดียว
//   บันทึกทั้งชุด + token ของชุดที่เปิดมา · ยอดเป็นข้อความบาท (เซิร์ฟเวอร์แปลง/ตรวจด้วย costRowsFromForm) · ชนกัน ⇒ ข้อความ + ปุ่มโหลดใหม่
//   🔴 ไม่คิดเลขเงิน (ยอดรวมจาก VM) · จอใหญ่ = แถวเดียวต่อรายการ · 390 = การ์ดต่อรายการ · ปุ่มบันทึกปิดระหว่างรอ
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { DepartureCostsVM } from "@/lib/modules/trips";
import { saveDepartureCostsAction } from "@/lib/modules/trips/cost-actions";
import { BTN, BTN_PRIMARY, INPUT } from "./ProductsScreenParts";
import { BTN_DANGER } from "./DepartureParts";
import { formatBaht } from "./trips-shared";

/** = TRIP_COST_KINDS (ลำดับแสดง) · TRIP_COST_ROWS_MAX · TRIP_COST_NOTE_MAX ของ report-core — คอมโพเนนต์ import ค่าจากบริการไม่ได้ */
const KINDS = ["BOAT", "FUEL", "GUIDE", "FOOD", "PARK_FEE", "TRANSPORT", "EQUIPMENT", "OTHER"] as const;
const ROWS_MAX = 30;
const NOTE_MAX = 200;
const KNOWN_ERRORS = new Set(["COST_ROWS_LIMIT", "COST_AMOUNT_INVALID", "COST_AMOUNT_FORMAT", "COST_NOTE_INVISIBLE", "INVALID_INPUT", "FORBIDDEN", "NOT_FOUND", "BUSY"]);

type Field = "kind" | "amount" | "note";
type Draft = { key: string; id: string | null; kind: string; amountText: string; note: string };
let seq = 0;
const newKey = () => `n${++seq}`;

/** รายการต้นทุนอ่านอย่างเดียว (ผู้มีสิทธิ์ดูต้นทุนแต่ไม่มีสิทธิ์บันทึก) */
export function CostRowsReadOnly({ vm }: { vm: DepartureCostsVM }) {
  const t = useTranslations("trips");
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p data-testid="trips-cost-readonly" role="status" className="rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-muted)]">
        {t("costs.readOnly")}
      </p>
      <ul data-testid="trips-cost-rows" className="flex min-w-0 flex-col">
        {vm.costs.rows.length === 0 ? <li className="py-2 text-sm text-[color:var(--color-muted)]">{t("costs.empty")}</li> : null}
        {vm.costs.rows.map((r, i) => (
          <li key={r.id} className={`flex min-w-0 items-baseline justify-between gap-3 py-2 text-sm ${i ? "border-t border-[color:var(--color-line)]" : ""}`}>
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <b className="text-[color:var(--color-ink)]">{t(`costs.kind.${r.kind}`)}</b>
              {r.note ? <span className="text-[color:var(--color-ink-soft)]"> · {r.note}</span> : null}
            </span>
            <b className="shrink-0 whitespace-nowrap tabular-nums text-[color:var(--color-ink)]">{formatBaht(r.amountSatang)}</b>
          </li>
        ))}
      </ul>
      <TotalLine vm={vm} />
    </div>
  );
}

function TotalLine({ vm }: { vm: DepartureCostsVM }) {
  const t = useTranslations("trips");
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-t border-[color:var(--color-line)] pt-2 text-sm font-bold">
      <span className="text-[color:var(--color-ink)]">{t("costs.total")}</span>
      <span className="whitespace-nowrap tabular-nums text-[color:var(--color-ink)]">{formatBaht(vm.costs.totalSatang)}</span>
    </div>
  );
}

/** แถวของตัวแก้จากชุดใน VM (ยอดเป็นข้อความบาทแบบที่จอแสดง) */
const draftsOf = (vm: DepartureCostsVM): Draft[] => vm.costs.rows.map((r) => ({ key: r.id, id: r.id, kind: r.kind, amountText: formatBaht(r.amountSatang), note: r.note ?? "" }));
const ERROR_ID = "trips-cost-error-msg";

/**
 * ตัวแก้ — ไม่ผูก key กับ token (Q3: ข้อความ "บันทึกแล้ว" อยู่รอดหลังหน้ารีเฟรช)
 * token ของ VM เปลี่ยน (บันทึกเอง/โหลดใหม่) ⇒ รับชุดใหม่จาก VM แทนแถวที่พิมพ์ไว้ (แถวใหม่ได้ id แล้ว — ไม่ถูกสร้างซ้ำ)
 */
export default function CostEditor({ vm }: { vm: DepartureCostsVM }) {
  const t = useTranslations("trips");
  const router = useRouter();
  const [rows, setRows] = useState<Draft[]>(() => draftsOf(vm));
  const [seenToken, setSeenToken] = useState(vm.costs.token);
  const [savedToken, setSavedToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; row: number | null; field: Field | null } | null>(null);
  const [conflict, setConflict] = useState(false);
  // รับชุดใหม่ระหว่างเรนเดอร์ (รูปแบบ "ปรับ state ตาม prop" ของ React) เมื่อ token ของ VM เปลี่ยน
  if (seenToken !== vm.costs.token) {
    setSeenToken(vm.costs.token);
    setRows(draftsOf(vm));
    setConflict(false);
    setError(null);
  }
  const saved = savedToken !== null && savedToken === vm.costs.token;
  const full = rows.length >= ROWS_MAX;

  const touch = () => {
    setSavedToken(null);
    setError(null);
  };
  const patch = (key: string, p: Partial<Draft>) => {
    touch();
    setRows((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  };
  const add = () => {
    if (full) return;
    touch();
    setRows((xs) => [...xs, { key: newKey(), id: null, kind: "OTHER", amountText: "", note: "" }]);
  };
  const remove = (key: string) => {
    touch();
    setRows((xs) => xs.filter((x) => x.key !== key));
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSavedToken(null);
    try {
      const r = await saveDepartureCostsAction(vm.unit.slug, {
        departureId: vm.departure.id,
        expectedToken: vm.costs.token,
        rows: rows.map((x) => ({ ...(x.id ? { id: x.id } : {}), kind: x.kind, amountText: x.amountText, note: x.note })),
      });
      if (!r.ok) {
        if (r.code === "STATE_CONFLICT") {
          setConflict(true);
          return;
        }
        // Q4 + U6: แถว + ช่องที่ผิดจากผลของ action (ไม่เดาช่อง)
        const row = "row" in r && typeof r.row === "number" ? r.row : null;
        const field = "field" in r && (r.field === "kind" || r.field === "amount" || r.field === "note") ? r.field : null;
        setError({ text: KNOWN_ERRORS.has(r.code) ? t(`errors.${r.code}`) : t("common.failed"), row, field });
        return;
      }
      setSavedToken(r.value.token);
      router.refresh();
    } catch {
      setError({ text: t("common.failed"), row: null, field: null });
    } finally {
      setBusy(false);
    }
  };
  const bad = (i: number, field: Field) => error !== null && error.row === i && error.field === field;

  return (
    <div data-testid="trips-cost-editor" className="flex min-w-0 flex-col gap-3">
      {rows.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">{t("costs.empty")}</p> : null}
      <ol className="flex min-w-0 flex-col gap-2">
        {rows.map((x, i) => (
          <li
            key={x.key}
            data-testid={`trips-cost-row-${i}`}
            aria-label={t("costs.editor.row", { n: i + 1 })}
            className="grid min-w-0 grid-cols-2 gap-2 rounded-lg border border-[color:var(--color-line)] p-2 md:grid-cols-[10rem_9rem_minmax(0,1fr)_auto] md:items-center md:border-0 md:p-0"
          >
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="text-[color:var(--color-muted)] md:sr-only">{t("costs.editor.kind")}</span>
              <select
                className={INPUT}
                value={x.kind}
                disabled={busy}
                aria-invalid={bad(i, "kind") ? true : undefined}
                aria-describedby={bad(i, "kind") ? ERROR_ID : undefined}
                onChange={(e) => patch(x.key, { kind: e.target.value })}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`costs.kind.${k}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="text-[color:var(--color-muted)] md:sr-only">{t("costs.editor.amount")}</span>
              <input
                className={`${INPUT} text-right tabular-nums`}
                inputMode="decimal"
                value={x.amountText}
                maxLength={20}
                disabled={busy}
                aria-invalid={bad(i, "amount") ? true : undefined}
                aria-describedby={bad(i, "amount") ? ERROR_ID : undefined}
                onChange={(e) => patch(x.key, { amountText: e.target.value })}
              />
            </label>
            <label className="col-span-2 flex min-w-0 flex-col gap-1 text-sm md:col-span-1">
              <span className="text-[color:var(--color-muted)] md:sr-only">{t("costs.editor.note")}</span>
              <input
                className={INPUT}
                value={x.note}
                maxLength={NOTE_MAX}
                disabled={busy}
                aria-invalid={bad(i, "note") ? true : undefined}
                aria-describedby={bad(i, "note") ? ERROR_ID : undefined}
                onChange={(e) => patch(x.key, { note: e.target.value })}
              />
            </label>
            <button type="button" data-testid={`trips-cost-remove-${i}`} disabled={busy} aria-label={t("costs.editor.removeAria", { n: i + 1 })} className={`${BTN_DANGER} col-span-2 md:col-span-1`} onClick={() => remove(x.key)}>
              {t("costs.editor.remove")}
            </button>
          </li>
        ))}
      </ol>
      <TotalLine vm={vm} />
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" data-testid="trips-cost-add" className={`${BTN} w-full`} disabled={full || busy} title={full ? t("costs.editor.limit") : undefined} onClick={add}>
          {full ? t("costs.editor.limit") : t("costs.editor.add")}
        </button>
        <button type="button" data-testid="trips-cost-save" className={`${BTN_PRIMARY} w-full`} disabled={busy || conflict} onClick={() => void save()}>
          {busy ? t("costs.editor.saving") : t("costs.editor.save")}
        </button>
      </div>
      {saved ? (
        <p role="status" className="text-sm text-[color:var(--color-ink-soft)]">
          {t("costs.editor.saved")}
        </p>
      ) : null}
      {conflict ? (
        <div data-testid="trips-cost-conflict" role="alert" className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-sm text-[color:var(--color-danger)]">
          <span className="min-w-0 [overflow-wrap:anywhere]">{t("costs.conflict")}</span>
          <button type="button" className={BTN} onClick={() => router.refresh()}>
            {t("costs.editor.reload")}
          </button>
        </div>
      ) : null}
      {error ? (
        <p id={ERROR_ID} data-testid="trips-cost-error" role="alert" className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-sm text-[color:var(--color-danger)] [overflow-wrap:anywhere]">
          {error.text}
        </p>
      ) : null}
    </div>
  );
}
