"use client";
// HR VIS-5d ▸ Q8 row editor for the onboarding/offboarding checklist templates — writes the same "key | title | dueDays" text into the
//   original textarea (child, kept in lifecycle-ui.tsx) · action + parser unchanged · without JS the textarea stays visible and works as before ◂
import { useEffect, useRef, useState, type ReactNode } from "react";

type Row = { key: string; title: string; dueDays: number };
type Labels = { title: string; days: string; add: string; remove: string; up: string; down: string };
const ROWS_MAX = 20; // LIFE_RANGE.rows
const TITLE_MAX = 80; // LIFE_RANGE.titleMax
const DUE_MAX = 90; // LIFE_RANGE.dueDays.max
const btn = "btn btn-ghost min-h-[44px] min-w-[44px] px-2 text-sm";

const textOf = (rows: Row[]) => rows.filter((r) => r.title.trim()).map((r) => `${r.key} | ${r.title.replace(/\|/g, "/").trim()} | ${r.dueDays}`).join("\n");
const newKey = (rows: Row[]) => {
  let n = rows.length + 1;
  while (rows.some((r) => r.key === `item_${n}`)) n += 1;
  return `item_${n}`;
};

export function TemplateRowsEditor({ initial, labels, prefix, children }: { initial: Row[]; labels: Labels; prefix: string; children: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Row[]>(initial);
  const [js, setJs] = useState(false);
  useEffect(() => setJs(true), []);
  useEffect(() => {
    if (!js) return;
    const ta = wrap.current?.querySelector("textarea");
    if (ta) ta.value = textOf(rows);
  }, [rows, js]);
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const out = [...rs];
      [out[i], out[j]] = [out[j]!, out[i]!];
      return out;
    });
  return (
    <div className="flex flex-col gap-2">
      <div ref={wrap} className={js ? "hidden" : "flex flex-col gap-1"}>
        {children}
      </div>
      {js && (
        <>
          <ul className="flex flex-col rounded-xl border border-[color:var(--color-line)]">
            {rows.map((r, i) => (
              <li key={r.key} className="flex flex-wrap items-center gap-2 border-t border-[color:var(--color-line)] px-3 py-2 first:border-t-0">
                <input
                  aria-label={labels.title}
                  value={r.title}
                  maxLength={TITLE_MAX}
                  onChange={(e) => set(i, { title: e.target.value })}
                  className="input min-h-[44px] min-w-0 flex-1 basis-40 text-sm"
                  data-testid={`hr-set-tpl-${prefix}-title-${i}`}
                />
                <label className="flex items-center gap-1 text-xs text-[color:var(--color-muted)]">
                  {labels.days}
                  <input
                    type="number"
                    min={0}
                    max={DUE_MAX}
                    value={r.dueDays}
                    onChange={(e) => set(i, { dueDays: Math.max(0, Math.min(DUE_MAX, Math.trunc(Number(e.target.value) || 0))) })}
                    className="input min-h-[44px] w-20 text-sm"
                    data-testid={`hr-set-tpl-${prefix}-days-${i}`}
                  />
                </label>
                <span className="flex gap-1">
                  {i > 0 && (
                    <button type="button" className={btn} aria-label={labels.up} title={labels.up} onClick={() => move(i, -1)} data-testid={`hr-set-tpl-${prefix}-up-${i}`}>
                      ↑
                    </button>
                  )}
                  {i < rows.length - 1 && (
                    <button type="button" className={btn} aria-label={labels.down} title={labels.down} onClick={() => move(i, 1)} data-testid={`hr-set-tpl-${prefix}-down-${i}`}>
                      ↓
                    </button>
                  )}
                  <button type="button" className={btn} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} data-testid={`hr-set-tpl-${prefix}-remove-${i}`}>
                    {labels.remove}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {rows.length < ROWS_MAX && (
            <button type="button" className="btn btn-ghost min-h-[44px] self-start text-sm" onClick={() => setRows((rs) => [...rs, { key: newKey(rs), title: "", dueDays: 0 }])} data-testid={`hr-set-tpl-${prefix}-add`}>
              {labels.add}
            </button>
          )}
        </>
      )}
    </div>
  );
}
