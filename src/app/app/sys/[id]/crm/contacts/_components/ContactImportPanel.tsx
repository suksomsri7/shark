"use client";

// ContactImportPanel.tsx — หน้านำเข้าผู้ติดต่อ + บริษัทจากไฟล์ CSV เดียว (ใบ C1.11 · พิมพ์เขียว §3.17) — `/crm/contacts/import`
// ขั้นตอน: เลือกไฟล์ → วัดขนาด/จำนวนแถว "ก่อนส่ง" (AUDIT-CLASS X6: CONTACT_IMPORT_MAX_BYTES · CONTACT_IMPORT_INLINE_MAX_ROWS — เซิร์ฟเวอร์ตรวจซ้ำ)
//   → จับคู่คอลัมน์ (รวมช่อง "บริษัท" = สร้าง/ผูกบริษัทในไฟล์เดียวกัน) → เลือกวิธีจัดการแถวซ้ำ 3 แบบ → ดูตัวอย่าง → นำเข้า
// 🔴 ไฟล์ client: import ได้เฉพาะ contacts-shared / core/csv (บริสุทธิ์) + server actions — ไม่ลากโมดูลที่ถึง prisma
// 🔴 ช่องที่ขึ้นต้นด้วย = + - @ เก็บเป็นข้อความตามที่พิมพ์ (ส่งออก CSV เติม ' ให้ — csvRow) · ข้อผิดพลาดแสดงในหน้า ไม่ใช้ alert()
// 🔴 390 px: ตัวอย่างข้อมูลเป็นการ์ดบนจอแคบ ตารางเฉพาะ md ขึ้นไป

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseCsv } from "@/lib/core/csv";
import { CONTACT_IMPORT_INLINE_MAX_ROWS, CONTACT_IMPORT_MAX_BYTES, type ImportContactsResult, type ImportDuplicateMode } from "@/lib/modules/crm/contacts-shared";
import { importContactsAction } from "@/lib/modules/crm/contacts-actions";

export type ImportOption = { value: string; label: string };

const GUESS: [RegExp, string][] = [
  [/^(ชื่อ|ชื่อจริง|first ?name|firstname|name)$/i, "firstName"],
  [/^(นามสกุล|last ?name|lastname|surname)$/i, "lastName"],
  [/(มือถือ|เบอร์|โทร|phone|mobile|tel)/i, "phone"],
  [/(อีเมล|e-?mail)/i, "email"],
  [/(ตำแหน่ง|job|title|position)/i, "jobTitle"],
  [/(แท็ก|tag)/i, "tags"],
  [/(บริษัท|company|organi[sz]ation)/i, "company"],
];
const PREVIEW = 5;

export function ContactImportPanel({ systemId, targets, modes }: { systemId: string; targets: ImportOption[]; modes: ImportOption[] }) {
  const router = useRouter();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<ImportDuplicateMode>("skip");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportContactsResult | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const maxMb = Math.round(CONTACT_IMPORT_MAX_BYTES / 1024 / 1024);
  const labelOf = (t: string) => targets.find((x) => x.value === t)?.label ?? "";

  const load = () =>
    start(async () => {
      setError(null);
      setResult(null);
      const file = fileRef.current?.files?.[0];
      if (!file) return setError("เลือกไฟล์ CSV ก่อน");
      if (file.size > CONTACT_IMPORT_MAX_BYTES) return setError(`ไฟล์ใหญ่เกิน ${maxMb} MB — แบ่งเป็นหลายไฟล์แล้วนำเข้าทีละไฟล์`);
      const t = parseCsv(await file.text());
      if (t.headers.length === 0) return setError("ไฟล์นี้ว่าง — ตรวจว่าแถวแรกเป็นหัวคอลัมน์");
      if (t.rows.length > CONTACT_IMPORT_INLINE_MAX_ROWS) {
        return setError(`ตอนนี้นำเข้าได้ครั้งละไม่เกิน ${CONTACT_IMPORT_INLINE_MAX_ROWS.toLocaleString("th-TH")} แถว — แบ่งไฟล์ (${t.rows.length.toLocaleString("th-TH")} แถว) เป็นหลายไฟล์แล้วนำเข้าทีละไฟล์`);
      }
      // วัดแบบเดียวกับเซิร์ฟเวอร์: ไบต์ UTF-8 ของ JSON {headers, rows} ที่จะส่งจริง
      if (new TextEncoder().encode(JSON.stringify({ headers: t.headers, rows: t.rows })).length > CONTACT_IMPORT_MAX_BYTES) {
        return setError(`ข้อมูลใหญ่เกิน ${maxMb} MB — แบ่งเป็นหลายไฟล์แล้วนำเข้าทีละไฟล์`);
      }
      setHeaders(t.headers);
      setRows(t.rows);
      const m: Record<string, string> = {};
      const used = new Set<string>();
      for (const h of t.headers) {
        const g = GUESS.find(([re, target]) => re.test(h.trim()) && !used.has(target));
        m[h] = g ? g[1] : "";
        if (g) used.add(g[1]);
      }
      setMapping(m);
    });

  const submit = () =>
    start(async () => {
      setError(null);
      if (!Object.values(mapping).some((t) => t === "firstName" || t === "lastName")) return setError("จับคู่คอลัมน์ชื่อก่อน (ชื่อจริง หรือ นามสกุล)");
      let r: Awaited<ReturnType<typeof importContactsAction>>;
      try {
        r = await importContactsAction(systemId, { headers, rows, mapping, onDuplicate: mode });
      } catch {
        router.refresh();
        return setError("การนำเข้าหยุดกลางทาง บางส่วนอาจบันทึกไปแล้ว — ตรวจรายชื่อก่อนนำเข้าซ้ำ");
      }
      if (!r.ok) return setError(r.error);
      setResult({ created: r.created, updated: r.updated, skipped: r.skipped, candidates: r.candidates, failed: r.failed, errors: r.errors });
      router.refresh();
    });

  const mapped = headers.filter((h) => mapping[h]);
  const sample = rows.slice(0, PREVIEW);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section className="card flex min-w-0 flex-col gap-2 p-4">
        <label className="flex min-w-0 flex-col gap-1 text-sm">
          <span className="font-medium">1. เลือกไฟล์ CSV</span>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="input min-w-0 text-sm" onChange={load} data-testid="crm-import-file" />
        </label>
        <p className="text-xs text-[color:var(--color-muted)]">
          แถวแรกเป็นหัวคอลัมน์ (ภาษาไทยได้) · ครั้งละไม่เกิน {CONTACT_IMPORT_INLINE_MAX_ROWS.toLocaleString("th-TH")} แถว / {maxMb} MB · ช่องที่ขึ้นต้นด้วย = + - @ เก็บเป็นข้อความตามที่พิมพ์
        </p>
      </section>

      {headers.length > 0 && (
        <section className="card flex min-w-0 flex-col gap-3 p-4" data-testid="crm-import-mapping">
          <span className="text-sm font-medium">2. จับคู่คอลัมน์ ({rows.length.toLocaleString("th-TH")} แถว)</span>
          {headers.map((h) => (
            <label key={h} className="grid min-w-0 grid-cols-1 items-center gap-1 text-sm sm:grid-cols-2 sm:gap-2">
              <span className="truncate" title={h}>
                {h}
              </span>
              <select value={mapping[h] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))} className="input min-w-0 text-sm" data-testid="crm-import-map">
                <option value="">— ไม่นำเข้า —</option>
                {targets.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium">3. ถ้าเบอร์/อีเมลซ้ำกับคนในระบบ</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as ImportDuplicateMode)} className="input min-w-0 text-sm" data-testid="crm-import-duplicate">
              {modes.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}

      {mapped.length > 0 && sample.length > 0 && (
        <section className="flex min-w-0 flex-col gap-2" data-testid="crm-import-preview">
          <span className="text-sm font-medium">ตัวอย่าง {sample.length} แถวแรก</span>
          <ul className="flex flex-col gap-2 md:hidden">
            {sample.map((r, i) => (
              <li key={i} className="card flex min-w-0 flex-col gap-0.5 p-3 text-sm">
                {mapped.map((h) => (
                  <span key={h} className="min-w-0 truncate">
                    <span className="text-xs text-[color:var(--color-muted)]">{labelOf(mapping[h] ?? "")}: </span>
                    {r[headers.indexOf(h)] ?? ""}
                  </span>
                ))}
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--color-muted)]">
                  {mapped.map((h) => (
                    <th key={h} className="px-2 py-1 font-normal">
                      {labelOf(mapping[h] ?? "")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sample.map((r, i) => (
                  <tr key={i} className="border-t">
                    {mapped.map((h) => (
                      <td key={h} className="max-w-[16rem] truncate px-2 py-1">
                        {r[headers.indexOf(h)] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {error && (
        <p className="text-sm text-[color:var(--color-danger)]" role="alert" data-testid="crm-import-error">
          {error}
        </p>
      )}
      {result && (
        <div className="card flex min-w-0 flex-col gap-1 p-4 text-sm" role="status" data-testid="crm-import-result">
          <p>
            เพิ่ม {result.created.toLocaleString("th-TH")} · อัปเดต {result.updated.toLocaleString("th-TH")} · ข้าม {result.skipped.toLocaleString("th-TH")} · คู่สงสัยซ้ำ {result.candidates.toLocaleString("th-TH")}
            {result.failed > 0 ? ` · มีปัญหา ${result.failed.toLocaleString("th-TH")} แถว` : ""}
          </p>
          {result.errors.length > 0 && (
            <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto text-xs text-[color:var(--color-muted)]">
              {result.errors.slice(0, 50).map((e, i) => (
                <li key={`${e.row}-${i}`}>
                  แถว {e.row}: {e.message}
                </li>
              ))}
            </ul>
          )}
          {result.candidates > 0 && (
            <Link href={`/app/sys/${systemId}/crm/contacts/duplicates`} className="text-sm text-[color:var(--color-accent)]" data-testid="crm-import-to-duplicates">
              ดูคู่ที่น่าจะซ้ำ →
            </Link>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Link href={`/app/sys/${systemId}/crm/contacts`} className="btn btn-ghost text-sm" data-testid="crm-import-cancel">
          กลับไปรายชื่อ
        </Link>
        <button type="button" className="btn btn-primary text-sm" disabled={pending || rows.length === 0} onClick={submit} data-testid="crm-import-submit">
          {pending ? "กำลังนำเข้า…" : "นำเข้า"}
        </button>
      </div>
    </div>
  );
}
