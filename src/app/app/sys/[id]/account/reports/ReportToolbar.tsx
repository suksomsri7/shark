"use client";

// พิมพ์ + ดาวน์โหลด CSV (UTF-8 BOM — เปิดใน Excel ไทยไม่เพี้ยน) — §10.10
// รับข้อมูลแบบ serializable จาก server component (สตางค์แปลงบาทที่ฝั่งเรียกแล้ว)

export type CsvData = { headers: string[]; rows: (string | number)[][] };

function toCsv(data: CsvData): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [data.headers.map(esc).join(",")];
  for (const r of data.rows) lines.push(r.map(esc).join(","));
  return lines.join("\r\n");
}

export default function ReportToolbar({
  filename,
  csv,
}: {
  filename: string;
  csv: CsvData;
}) {
  const download = () => {
    const blob = new Blob(["﻿" + toCsv(csv)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className="btn text-sm">
        พิมพ์
      </button>
      <button type="button" onClick={download} className="btn text-sm">
        ดาวน์โหลด CSV
      </button>
    </div>
  );
}
