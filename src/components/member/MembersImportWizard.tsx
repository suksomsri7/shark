// MembersImportWizard.tsx — นำเข้าสมาชิกจาก CSV 3 ขั้น (M1.6 · ภาพ 12 · ตีกลับรอบ 1)
// testid: members-import-step-1/2/3 members-import-upload members-import-mapping members-import-preview
//         members-import-dup-option members-import-next members-import-run members-import-result
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MemberIcon } from "./MemberIcon";
import { parseCsv } from "@/lib/core/csv";
import { MEMBER_SOURCE_LABELS } from "@/lib/modules/member/member-source-labels";
import { updateFieldAction } from "@/lib/modules/member/fields-actions";
import { autoMappingAction, importMembersAction, previewImportAction } from "@/lib/modules/member/import-actions";
import type { ImportOnDuplicate, ImportPreviewResult, ImportResult } from "@/lib/modules/member/import";

type FieldOption = {
  id: string;
  key: string;
  label: string;
  type: string;
  isSystem: boolean;
  choices?: { value: string; label: string }[];
};
type Step = 1 | 2 | 3;
type ColumnIssue = { total: number; bad: number; reason?: string; badSample?: string };

const PREVIEW_LEFT_COLS = 3;

function normPhoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function MembersImportWizard({
  systemId,
  fieldOptions,
  units,
}: {
  systemId: string;
  fieldOptions: FieldOption[];
  units: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [choicesByKey, setChoicesByKey] = useState<Record<string, { value: string; label: string }[]>>(() => {
    const out: Record<string, { value: string; label: string }[]> = {};
    for (const f of fieldOptions) if (f.choices) out[f.key] = f.choices;
    return out;
  });
  const [choiceBusy, setChoiceBusy] = useState<string | null>(null);
  const [choiceError, setChoiceError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [sourceValue, setSourceValue] = useState("IMPORT");
  const [onDuplicate, setOnDuplicate] = useState<ImportOnDuplicate>("skip");
  const [homeUnitId, setHomeUnitId] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fieldByKey = new Map(fieldOptions.map((f) => [f.key, f]));

  const runPreview = async (): Promise<ImportPreviewResult | null> => {
    if (rows.length === 0) return null;
    setPreviewBusy(true);
    const res = await previewImportAction({ systemId, rows, mapping });
    setPreviewBusy(false);
    if (!res.ok) {
      setError(res.reason);
      return null;
    }
    setPreview(res.data);
    return res.data;
  };

  // ตรวจแถวใหม่ทุกครั้งที่ mapping เปลี่ยน (debounce 400ms) — ใช้เติมชิปสถานะต่อคอลัมน์ขั้น 2 +
  // กล่องสรุปด้านขวา · ไม่ต้องรอกด "ตรวจข้อมูล" ก่อนถึงจะเห็นตัวเลข
  useEffect(() => {
    if (rows.length === 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runPreview();
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapping, rows]);

  const onFile = async (file: File) => {
    setError(null);
    setResult(null);
    setPreview(null);
    setFileName(file.name);
    const text = await file.text();
    const table = parseCsv(text);
    if (table.headers.length === 0) {
      setError("อ่านไฟล์ไม่สำเร็จ — ต้องเป็น CSV ที่มีบรรทัดหัวคอลัมน์และอย่างน้อย 1 แถว");
      setRows([]);
      return;
    }
    setHeaders(table.headers);
    const objRows = table.rows.map((r) => Object.fromEntries(table.headers.map((h, i) => [h, r[i] ?? ""])));
    setRows(objRows);
    setBusy(true);
    const res = await autoMappingAction({ systemId, headers: table.headers });
    setBusy(false);
    const map: Record<string, string> = {};
    for (const h of table.headers) map[h] = (res.ok ? res.data[h] : null) ?? "skip";
    setMapping(map);
  };

  const toStep2 = () => {
    if (rows.length > 0) setStep(2);
  };

  const toStep3 = async () => {
    setBusy(true);
    const p = await runPreview();
    setBusy(false);
    if (p) setStep(3);
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const res = await importMembersAction({
      systemId,
      rows,
      mapping,
      options: { onDuplicate, source: sourceValue, fileName: fileName || undefined, homeUnitId: homeUnitId || undefined, tags },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    setResult(res.data);
  };

  // ── ตัวช่วยขั้น 2 ──

  const uniqueValues = (header: string, cap = 24): string[] => {
    const seen = new Set<string>();
    for (const r of rows) {
      const v = (r[header] ?? "").trim();
      if (v && !seen.has(v)) seen.add(v);
      if (seen.size >= cap) break;
    }
    return [...seen];
  };

  /** ตรวจต่อคอลัมน์ฝั่ง client (เฉพาะ phone/date/select ตามกฎเดียวกับ fields engine — preview ฝั่งเซิร์ฟเวอร์ไม่แยกเป็นรายคอลัมน์) */
  const columnIssue = (header: string): ColumnIssue | null => {
    const key = mapping[header];
    if (!key || key === "skip") return null;
    const field = fieldByKey.get(key);
    if (!field) return null;
    const values = rows.map((r) => (r[header] ?? "").trim()).filter(Boolean);
    const total = values.length;
    if (key === "phone") {
      let bad = 0;
      let sample: string | undefined;
      for (const v of values) {
        if (normPhoneDigits(v).length < 9) {
          bad++;
          sample = sample ?? v;
        }
      }
      return bad > 0 ? { total, bad, reason: "เบอร์ไม่ครบ 10 หลัก", badSample: sample } : { total, bad: 0 };
    }
    if (field.type === "DATE" || field.type === "DATETIME") {
      let bad = 0;
      let sample: string | undefined;
      for (const v of values) {
        if (!/^\d{4}-\d{2}-\d{2}/.test(v)) {
          bad++;
          sample = sample ?? v;
        }
      }
      return bad > 0 ? { total, bad, reason: "รูปแบบวันที่ไม่ตรง (ปี-เดือน-วัน)", badSample: sample } : { total, bad: 0 };
    }
    if (field.type === "SELECT") {
      const choices = new Set((choicesByKey[key] ?? field.choices ?? []).map((c) => c.value));
      let bad = 0;
      let sample: string | undefined;
      for (const v of values) {
        if (!choices.has(v)) {
          bad++;
          sample = sample ?? v;
        }
      }
      return bad > 0 ? { total, bad, reason: "ค่าไม่ตรงตัวเลือก", badSample: sample } : { total, bad: 0 };
    }
    return { total, bad: 0 };
  };

  const addChoice = async (field: FieldOption, value: string) => {
    setChoiceBusy(field.key);
    setChoiceError(null);
    const current = choicesByKey[field.key] ?? field.choices ?? [];
    const next = [...current, { value, label: value }];
    const res = await updateFieldAction({ systemId, id: field.id, patch: { options: { choices: next } } });
    setChoiceBusy(null);
    if (!res.ok) {
      setChoiceError(res.reason);
      return;
    }
    setChoicesByKey((prev) => ({ ...prev, [field.key]: res.data.options.choices ?? next }));
  };

  const selectMappedHeaders = headers.filter((h) => fieldByKey.get(mapping[h] ?? "")?.type === "SELECT");
  const ready = (preview?.ok ?? 0) + (preview?.warn ?? 0);
  const bad = preview?.err ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex items-center gap-2 text-xs" style={{ color: "var(--color-muted)" }}>
        <li className={step === 1 ? "font-semibold text-[color:var(--color-ink)]" : ""}>1 อัปโหลดไฟล์</li>
        <li>›</li>
        <li className={step === 2 ? "font-semibold text-[color:var(--color-ink)]" : ""}>2 จับคู่คอลัมน์</li>
        <li>›</li>
        <li className={step === 3 ? "font-semibold text-[color:var(--color-ink)]" : ""}>3 ตรวจแถวและยืนยัน</li>
      </ol>

      {error && (
        <p className="text-sm" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}

      {step === 1 && (
        <div data-testid="members-import-step-1" className="card flex flex-col gap-3 p-5">
          <div data-testid="members-import-upload" className="flex flex-col gap-2">
            <label className="text-sm font-medium">อัปโหลดไฟล์ CSV</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            {fileName && (
              <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                {fileName} · {rows.length.toLocaleString("th-TH")} แถว
              </p>
            )}
          </div>
          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-line)" }}>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="border-b px-2 py-1 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((r, i) => (
                    <tr key={i}>
                      {headers.map((h) => (
                        <td key={h} className="border-b px-2 py-1">
                          {r[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="members-import-next"
              className="btn btn-primary text-sm"
              onClick={toStep2}
              disabled={rows.length === 0 || busy}
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div data-testid="members-import-step-2" className="card flex flex-col gap-4 p-5 lg:grid lg:grid-cols-[240px_1fr_260px] lg:gap-5 lg:space-y-0">
          {/* ── ซ้าย: ตัวอย่างไฟล์ + ตัวอย่างค่าฟิลด์ตัวเลือก ── */}
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold">ตัวอย่างไฟล์ — 5 แถวแรก</h3>
              <div className="mt-1 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--color-line)" }}>
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead>
                    <tr>
                      {headers.slice(0, PREVIEW_LEFT_COLS).map((h) => (
                        <th key={h} className="border-b px-1.5 py-1 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        {headers.slice(0, PREVIEW_LEFT_COLS).map((h) => (
                          <td key={h} className="border-b px-1.5 py-1">
                            {r[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {headers.length > PREVIEW_LEFT_COLS && (
                <p className="mt-1 text-[11px]" style={{ color: "var(--color-muted)" }}>
                  อีก {headers.length - PREVIEW_LEFT_COLS} คอลัมน์: {headers.slice(PREVIEW_LEFT_COLS).join(", ")}
                </p>
              )}
            </div>
            {selectMappedHeaders.map((h) => {
              const key = mapping[h];
              const field = fieldByKey.get(key ?? "");
              if (!field) return null;
              const choices = new Set((choicesByKey[field.key] ?? field.choices ?? []).map((c) => c.value));
              const values = uniqueValues(h);
              return (
                <div key={h}>
                  <h4 className="text-xs font-semibold">ตัวอย่างค่า {field.label}</h4>
                  <ul className="mt-1 flex flex-col gap-1">
                    {values.map((v) => (
                      <li key={v} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="truncate">{v}</span>
                        <span
                          className="shrink-0 rounded-full border px-1.5 py-0.5"
                          style={
                            choices.has(v)
                              ? { borderColor: "var(--color-tag-green)", color: "var(--color-tag-green)" }
                              : { borderColor: "var(--color-tag-amber)", color: "var(--color-tag-amber)" }
                          }
                        >
                          {choices.has(v) ? "ตรงตัวเลือก" : "ไม่ตรง"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* ── กลาง: แถวจับคู่คอลัมน์ ── */}
          <div data-testid="members-import-mapping" className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">จับคู่คอลัมน์ไฟล์ → ฟิลด์สมาชิก</h3>
            {choiceError && (
              <p className="text-xs" style={{ color: "var(--color-danger)" }}>
                {choiceError}
              </p>
            )}
            {headers.map((h) => {
              const issue = columnIssue(h);
              const key = mapping[h];
              const field = fieldByKey.get(key ?? "");
              return (
                <div key={h} className="rounded-lg border p-2" style={{ borderColor: "var(--color-line)" }}>
                  <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <div className="min-w-0 font-mono text-sm">{h}</div>
                    <select
                      className="rounded-lg border px-2 py-1.5 text-sm"
                      value={mapping[h] ?? "skip"}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [h]: e.target.value }))}
                    >
                      <option value="skip">ข้ามคอลัมน์นี้</option>
                      {fieldOptions.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                          {!f.isSystem ? " (กำหนดเอง)" : ""}
                        </option>
                      ))}
                    </select>
                    {issue && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 justify-self-end rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap"
                        style={
                          issue.bad === 0
                            ? { borderColor: "var(--color-tag-green)", color: "var(--color-tag-green)" }
                            : { borderColor: "var(--color-tag-amber)", color: "var(--color-tag-amber)" }
                        }
                      >
                        <MemberIcon name={issue.bad === 0 ? "check" : "warn"} size="xs" />
                        {issue.bad === 0 ? `${issue.total} แถว` : `${issue.bad} แถว ${issue.reason ?? ""}`}
                      </span>
                    )}
                  </div>
                  {issue && issue.bad > 0 && field?.type === "SELECT" && (
                    <p className="mt-1 flex items-center gap-1 text-[11px]" style={{ color: "var(--color-muted)" }}>
                      <MemberIcon name="warn" size="xs" />
                      {issue.bad} แถว ค่าไม่ตรงตัวเลือก (เช่น &quot;{issue.badSample}&quot;) —{" "}
                      <button
                        type="button"
                        className="underline"
                        style={{ color: "var(--color-accent)" }}
                        disabled={choiceBusy === field.key || !issue.badSample}
                        onClick={() => issue.badSample && addChoice(field, issue.badSample)}
                      >
                        เพิ่มเป็นตัวเลือกใหม่
                      </button>{" "}
                      หรือ{" "}
                      <button type="button" className="underline" style={{ color: "var(--color-accent)" }} onClick={() => setMapping((prev) => ({ ...prev, [h]: "skip" }))}>
                        ข้าม
                      </button>
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── ขวา: ตั้งค่าการนำเข้า ── */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">ตั้งค่าการนำเข้า</h3>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
              ช่องทางที่มา
              <select className="rounded-lg border px-2 py-1.5 text-sm" value={sourceValue} onChange={(e) => setSourceValue(e.target.value)}>
                {Object.entries(MEMBER_SOURCE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div data-testid="members-import-dup-option" className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
              ถ้าเบอร์ซ้ำกับสมาชิกเดิม
              <select
                className="rounded-lg border px-2 py-1.5 text-sm"
                value={onDuplicate}
                onChange={(e) => setOnDuplicate(e.target.value as ImportOnDuplicate)}
              >
                <option value="skip">ข้าม</option>
                <option value="update">อัปเดตของเดิม</option>
                <option value="candidate">สร้างใหม่ + ตั้งข้อสงสัย</option>
              </select>
            </div>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
              สาขาหลัก (ไม่เลือก = ไม่ตั้งสาขา)
              <select className="rounded-lg border px-2 py-1.5 text-sm" value={homeUnitId} onChange={(e) => setHomeUnitId(e.target.value)}>
                <option value="">— ไม่ระบุ —</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
              แท็ก (คั่นด้วยจุลภาค)
              <input
                className="rounded-lg border px-2 py-1.5 text-sm"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="import-2569"
              />
            </label>
            <div className="rounded-lg border p-2 text-xs" style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}>
              {previewBusy ? (
                "กำลังตรวจ…"
              ) : (
                <>
                  สรุปก่อนนำเข้า: {rows.length.toLocaleString("th-TH")} แถว
                  <br />
                  พร้อม {ready.toLocaleString("th-TH")} แถว
                  <br />
                  ต้องแก้ {bad.toLocaleString("th-TH")} แถว (จะข้ามอัตโนมัติ)
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 lg:col-span-3">
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setStep(1)}>
              ย้อนกลับ
            </button>
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                จะนำเข้า {ready.toLocaleString("th-TH")} คน · ข้าม {bad.toLocaleString("th-TH")} แถวที่มีปัญหา
              </span>
              <button type="button" data-testid="members-import-next" className="btn btn-primary text-sm" onClick={() => void toStep3()} disabled={busy}>
                {busy ? "กำลังตรวจ…" : "ตรวจข้อมูล"}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div data-testid="members-import-step-3" className="card flex flex-col gap-3 p-5">
          {preview && (
            <div data-testid="members-import-preview" className="flex flex-col gap-2">
              <p className="text-sm">
                พร้อมนำเข้า <b>{preview.ok}</b> แถว · ซ้ำกับสมาชิกเดิม <b>{preview.warn}</b> แถว · ผิดพลาด <b>{preview.err}</b> แถว
              </p>
              <div className="max-h-64 overflow-auto rounded-lg border" style={{ borderColor: "var(--color-line)" }}>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border-b px-2 py-1 text-left">แถว</th>
                      <th className="border-b px-2 py-1 text-left">สถานะ</th>
                      <th className="border-b px-2 py-1 text-left">รายละเอียด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((s) => (
                      <tr key={s.row}>
                        <td className="border-b px-2 py-1">{s.row}</td>
                        <td className="border-b px-2 py-1">{s.status === "ok" ? "พร้อม" : s.status === "warn" ? "ซ้ำ" : "ผิดพลาด"}</td>
                        <td className="border-b px-2 py-1">{s.message ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button type="button" className="btn btn-ghost text-sm" onClick={() => setStep(2)}>
              ย้อนกลับ
            </button>
            <button type="button" data-testid="members-import-run" className="btn btn-primary text-sm" onClick={() => void run()} disabled={busy}>
              {busy ? "กำลังนำเข้า…" : `นำเข้า ${ready} คน`}
            </button>
          </div>

          {result && (
            <div data-testid="members-import-result" className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--color-line)" }}>
              <p>
                สร้างใหม่ {result.created} · อัปเดต {result.updated} · ข้าม {result.skipped} · ตั้งข้อสงสัย {result.candidates} · ล้มเหลว {result.failed}
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
                  {result.errors.slice(0, 20).map((e) => (
                    <li key={e.row}>
                      แถว {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex justify-end">
                <button type="button" className="btn btn-primary text-sm" onClick={() => router.push(`/app/sys/${systemId}/member/members`)}>
                  ไปหน้ารวมสมาชิก
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MembersImportWizard;
