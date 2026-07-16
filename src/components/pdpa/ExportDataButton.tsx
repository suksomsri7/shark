"use client";

import { useState } from "react";
import { exportMyDataAction } from "@/lib/pdpa/actions";

// ปุ่มดาวน์โหลดข้อมูลร้าน — เรียก action ฝั่ง server แล้วสร้างไฟล์ JSON ให้โหลดฝั่ง client
export function ExportDataButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await exportMyDataAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const blob = new Blob([res.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("ดาวน์โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="btn btn-primary w-full text-sm disabled:opacity-50 sm:w-auto"
      >
        {busy ? "กำลังเตรียมไฟล์…" : "⬇ ดาวน์โหลดข้อมูลของร้าน (JSON)"}
      </button>
      {error && <p className="text-sm text-[color:var(--color-danger)]">{error}</p>}
    </div>
  );
}
