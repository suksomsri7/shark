"use client";

import { useActionState, useState } from "react";
import type { ImportSummary } from "@/lib/core/csv";

// ── นำเข้าข้อมูลจาก CSV (WO Wave6-A) — วางข้อความ CSV หรืออัปโหลดไฟล์ .csv จาก Excel ──
// ใช้ร่วมกันทั้งลูกค้า (member) และสินค้า (inventory) — ต่าง entity ส่ง action + เทมเพลตต่างกัน
type Props = {
  systemId: string;
  entityLabel: string; // "ลูกค้า" / "สินค้า"
  templateHeader: string; // หัวคอลัมน์เทมเพลต เช่น "ชื่อ,เบอร์โทร,อีเมล"
  templateSample: string; // ตัวอย่างข้อมูล 1-2 แถว
  templateFilename: string; // ชื่อไฟล์ดาวน์โหลด เช่น "ลูกค้า-ตัวอย่าง.csv"
  supportedHeaders: string; // คำอธิบายหัวคอลัมน์ที่รองรับ
  successNote?: string; // ข้อความเสริมเมื่อสร้างสำเร็จ (เช่น เตือนยอดสต็อกเริ่ม 0)
  action: (systemId: string, prev: ImportSummary | null, formData: FormData) => Promise<ImportSummary | null>;
};

export default function CsvImport({
  systemId,
  entityLabel,
  templateHeader,
  templateSample,
  templateFilename,
  supportedHeaders,
  successNote,
  action,
}: Props) {
  const [text, setText] = useState("");
  const [state, formAction, pending] = useActionState<ImportSummary | null, FormData>(
    (prev, fd) => action(systemId, prev, fd),
    null,
  );

  // อ่านไฟล์ที่เลือกเป็นข้อความ แล้วเทลงกล่องข้อความ (ให้ผู้ใช้ตรวจก่อนกดนำเข้า)
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setText(await file.text());
  }

  function downloadTemplate() {
    // นำหน้าด้วย BOM เพื่อให้ Excel เปิดภาษาไทยไม่เพี้ยน
    const blob = new Blob(["﻿" + templateHeader + "\n" + templateSample + "\n"], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = templateFilename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-xs text-[color:var(--color-muted)]">
        คัดลอกข้อมูลจาก Excel มาวางในกล่องด้านล่าง หรืออัปโหลดไฟล์ .csv — บรรทัดแรกต้องเป็นหัวคอลัมน์
        <br />
        หัวคอลัมน์ที่รองรับ (ไทยหรืออังกฤษ): {supportedHeaders}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={downloadTemplate}
          className="btn btn-ghost min-h-[44px] text-sm"
        >
          ดาวน์โหลดเทมเพลต CSV
        </button>
        <label className="btn btn-ghost min-h-[44px] cursor-pointer text-sm">
          เลือกไฟล์ .csv
          <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={onFile} className="hidden" />
        </label>
      </div>

      <textarea
        name="csv"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={`${templateHeader}\n${templateSample}`}
        className="input font-mono text-xs"
      />

      <button
        type="submit"
        disabled={pending || !text.trim()}
        className="btn btn-primary min-h-[44px] text-sm disabled:opacity-50"
      >
        {pending ? "กำลังนำเข้า…" : `นำเข้า${entityLabel}`}
      </button>

      {state && (
        <div className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="text-[color:var(--color-accent)]">สร้างใหม่ {state.created} รายการ</span>
            <span className="text-[color:var(--color-muted)]">ข้าม (ซ้ำ) {state.skipped} รายการ</span>
            {state.errors.length > 0 && (
              <span className="text-[color:var(--color-danger)]">ผิดพลาด {state.errors.length} แถว</span>
            )}
          </div>
          {state.errors.length > 0 && (
            <ul className="flex flex-col gap-0.5 border-t pt-2 text-xs text-[color:var(--color-danger)]">
              {state.errors.slice(0, 50).map((er, i) => (
                <li key={i}>
                  {er.row > 0 ? `แถวที่ ${er.row}: ` : ""}
                  {er.reason}
                </li>
              ))}
              {state.errors.length > 50 && <li>… และอีก {state.errors.length - 50} แถว</li>}
            </ul>
          )}
          {state.created > 0 && (
            <p className="border-t pt-2 text-xs text-[color:var(--color-muted)]">
              {successNote ?? "นำเข้าสำเร็จ — รีเฟรชหน้าเพื่อดูรายการที่เพิ่มเข้ามา"}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
