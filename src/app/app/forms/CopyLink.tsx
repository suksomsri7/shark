"use client";

import { useState } from "react";

// ปุ่มคัดลอกลิงก์สาธารณะ /f/<token>
export function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // fallback: เลือกข้อความให้ผู้ใช้ก๊อปเอง
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={url} className="input flex-1 text-xs" onFocus={(e) => e.target.select()} />
      <button type="button" onClick={copy} className="btn btn-ghost shrink-0 text-sm">
        {done ? "คัดลอกแล้ว" : "คัดลอก"}
      </button>
    </div>
  );
}
