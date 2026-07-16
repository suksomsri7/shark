"use client";

import { useMemo, useState, useTransition } from "react";
import {
  runReportAction,
  exportReportCsvAction,
  saveReportAction,
  deleteReportAction,
} from "@/lib/modules/reports/actions";

// เครื่องมือสร้างรายงานฝั่ง client — ประกอบ config (dataset/filters/groupBy/metric)
// แล้วเรียก server action รัน/ดาวน์โหลด/บันทึก · inline error ไม่ใช้ alert (UI_STANDARD)

export type ColType = "string" | "number" | "date";
export type Column = { key: string; label: string; type: ColType };
export type DatasetMeta = { key: string; label: string; columns: Column[] };

type FilterOp = "eq" | "gte" | "lte" | "contains";
type FilterRow = { field: string; op: FilterOp; value: string };
type ReportInput = {
  dataset: string;
  filters?: { field: string; op: FilterOp; value: unknown }[];
  groupBy?: string;
  metric?: string;
};
export type SavedReport = { id: string; name: string; config: ReportInput; createdAt: string };
type Result = { columns: Column[]; rows: Record<string, unknown>[] };

const OPS: { value: FilterOp; label: string }[] = [
  { value: "eq", label: "เท่ากับ" },
  { value: "gte", label: "มากกว่าหรือเท่ากับ" },
  { value: "lte", label: "น้อยกว่าหรือเท่ากับ" },
  { value: "contains", label: "มีคำว่า" },
];

const inputCls = "input";

// แปลงค่าดิบตามชนิดคอลัมน์ (ตัวเลข → number, ที่เหลือ → string)
function coerce(cols: Column[], field: string, raw: string): unknown {
  const t = cols.find((c) => c.key === field)?.type;
  if (t === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  return raw;
}

function cellText(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    return new Date(v).toLocaleString("th-TH");
  }
  return String(v);
}

export function ReportBuilder({
  datasets,
  initialSaved,
}: {
  datasets: DatasetMeta[];
  initialSaved: SavedReport[];
}) {
  const [datasetKey, setDatasetKey] = useState(datasets[0]?.key ?? "");
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [groupBy, setGroupBy] = useState("");
  const [metricKind, setMetricKind] = useState<"count" | "sum">("count");
  const [sumField, setSumField] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [saveName, setSaveName] = useState("");
  const [saved, setSaved] = useState<SavedReport[]>(initialSaved);
  const [pending, start] = useTransition();

  const ds = useMemo(() => datasets.find((d) => d.key === datasetKey), [datasets, datasetKey]);
  const cols = ds?.columns ?? [];
  const numberCols = cols.filter((c) => c.type === "number");

  // สร้าง config จาก state ปัจจุบัน
  const buildConfig = (): ReportInput => ({
    dataset: datasetKey,
    filters: filters
      .filter((f) => f.field)
      .map((f) => ({ field: f.field, op: f.op, value: coerce(cols, f.field, f.value) })),
    groupBy: groupBy || undefined,
    metric: groupBy && metricKind === "sum" && sumField ? `sum:${sumField}` : undefined,
  });

  const resetFor = (key: string) => {
    setDatasetKey(key);
    setFilters([]);
    setGroupBy("");
    setMetricKind("count");
    setSumField("");
    setResult(null);
    setError("");
  };

  const run = () => {
    setError("");
    start(async () => {
      try {
        setResult(await runReportAction(buildConfig()));
      } catch (e) {
        setResult(null);
        setError(e instanceof Error ? e.message : "รันรายงานไม่สำเร็จ");
      }
    });
  };

  const download = () => {
    setError("");
    start(async () => {
      try {
        const csv = await exportReportCsvAction(buildConfig());
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${ds?.label ?? "report"}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "ดาวน์โหลดไม่สำเร็จ");
      }
    });
  };

  const save = () => {
    setError("");
    if (!saveName.trim()) {
      setError("กรุณาตั้งชื่อรายงานก่อนบันทึก");
      return;
    }
    start(async () => {
      try {
        await saveReportAction({ name: saveName.trim(), config: buildConfig() });
        setSaveName("");
        // โหลดรายการล่าสุดโดยเพิ่มด้านบน (id จริงจะได้ตอน reload) — ดึงใหม่ให้ตรง
        const { listReportsAction } = await import("@/lib/modules/reports/actions");
        setSaved((await listReportsAction()) as SavedReport[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      }
    });
  };

  const load = (r: SavedReport) => {
    const c = r.config;
    setDatasetKey(c.dataset);
    setGroupBy(c.groupBy ?? "");
    if (c.metric?.startsWith("sum:")) {
      setMetricKind("sum");
      setSumField(c.metric.slice(4));
    } else {
      setMetricKind("count");
      setSumField("");
    }
    setFilters(
      (c.filters ?? []).map((f) => ({ field: f.field, op: f.op, value: String(f.value ?? "") })),
    );
    setResult(null);
    setError("");
  };

  const remove = (id: string) => {
    start(async () => {
      try {
        await deleteReportAction(id);
        setSaved((s) => s.filter((r) => r.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
      }
    });
  };

  const addFilter = () =>
    setFilters((f) => [...f, { field: cols[0]?.key ?? "", op: "eq", value: "" }]);
  const patchFilter = (i: number, p: Partial<FilterRow>) =>
    setFilters((f) => f.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  const rmFilter = (i: number) => setFilters((f) => f.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-[color:var(--color-surface-2)] p-2 text-sm text-[color:var(--color-danger)]">
          {error}
        </p>
      )}

      {/* เลือกชุดข้อมูล */}
      <div className="card flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>ชุดข้อมูล</span>
          <select
            value={datasetKey}
            onChange={(e) => resetFor(e.target.value)}
            className={inputCls}
          >
            {datasets.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        {/* ตัวกรอง */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">ตัวกรอง ({filters.length})</span>
          <button type="button" onClick={addFilter} className="btn btn-ghost text-sm">
            + เพิ่มตัวกรอง
          </button>
        </div>
        {filters.map((f, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              value={f.field}
              onChange={(e) => patchFilter(i, { field: e.target.value })}
              className={inputCls}
            >
              {cols.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={f.op}
              onChange={(e) => patchFilter(i, { op: e.target.value as FilterOp })}
              className={inputCls}
            >
              {OPS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              value={f.value}
              onChange={(e) => patchFilter(i, { value: e.target.value })}
              placeholder="ค่า"
              className={`${inputCls} flex-1`}
            />
            <button
              type="button"
              onClick={() => rmFilter(i)}
              className="text-sm text-[color:var(--color-danger)]"
              aria-label="ลบตัวกรอง"
            >
              ลบ
            </button>
          </div>
        ))}

        {/* จัดกลุ่ม + ตัวชี้วัด */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            <span>จัดกลุ่มตาม</span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className={inputCls}
            >
              <option value="">— ไม่จัดกลุ่ม (แถวดิบ) —</option>
              {cols.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {groupBy && (
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              <span>ตัวชี้วัด</span>
              <select
                value={metricKind}
                onChange={(e) => setMetricKind(e.target.value as "count" | "sum")}
                className={inputCls}
              >
                <option value="count">นับจำนวน</option>
                <option value="sum">รวมค่า</option>
              </select>
            </label>
          )}
          {groupBy && metricKind === "sum" && (
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              <span>รวมฟิลด์</span>
              <select
                value={sumField}
                onChange={(e) => setSumField(e.target.value)}
                className={inputCls}
              >
                <option value="">— เลือกฟิลด์ตัวเลข —</option>
                {numberCols.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="btn btn-primary text-sm disabled:opacity-50"
          >
            {pending ? "กำลังรัน…" : "รันรายงาน"}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={pending}
            className="btn btn-ghost text-sm disabled:opacity-50"
          >
            ดาวน์โหลด CSV
          </button>
        </div>
      </div>

      {/* ผลลัพธ์ */}
      {result && (
        <div className="card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">ผลลัพธ์ ({result.rows.length} แถว)</span>
          </div>
          {result.rows.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">ไม่มีข้อมูลตามเงื่อนไข</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-[color:var(--color-muted)]">
                    {result.columns.map((c) => (
                      <th key={c.key} className="px-2 py-1.5 font-medium">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {result.columns.map((c) => (
                        <td key={c.key} className="px-2 py-1.5">
                          {cellText(row[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* บันทึกรายงาน */}
          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="ตั้งชื่อรายงานเพื่อบันทึก"
              className={`${inputCls} flex-1`}
            />
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="btn btn-primary text-sm disabled:opacity-50"
            >
              บันทึกรายงาน
            </button>
          </div>
        </div>
      )}

      {/* รายงานที่บันทึกไว้ */}
      <div className="card flex flex-col gap-2">
        <span className="text-sm font-medium">รายงานที่บันทึกไว้ ({saved.length})</span>
        {saved.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีรายงานที่บันทึก</p>
        ) : (
          saved.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 border-b py-1.5 last:border-0">
              <button
                type="button"
                onClick={() => load(r)}
                className="flex-1 truncate text-left text-sm hover:underline"
              >
                {r.name}
              </button>
              <button
                type="button"
                onClick={() => remove(r.id)}
                disabled={pending}
                className="text-xs text-[color:var(--color-danger)] disabled:opacity-50"
              >
                ลบ
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
