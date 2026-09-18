"use client";

// ปุ่ม "บันทึกกิจกรรม" ของหน้ากิจกรรม (CRM v2 · ใบ C1.6 · ภาพ 08 มุมขวาบน) — เปิดฟอร์มที่ให้เลือกผู้ติดต่อ/ดีล/บริษัทเอง
// 🔴 ไฟล์ client: import ได้เฉพาะ activities-shared (บริสุทธิ์) + คอมโพเนนต์ฟอร์ม

import { useState } from "react";
import type { ActivityType, MentionOption } from "@/lib/modules/crm/activities-shared";
import { LogActivityForm } from "./LogActivityForm";

export function NewActivityButton({ systemId, outcomes, mentionOptions }: { systemId: string; outcomes: Partial<Record<ActivityType, string[]>>; mentionOptions: MentionOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="btn btn-primary self-end text-sm" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="activities-new">
        {open ? "ปิดฟอร์ม" : "+ บันทึกกิจกรรม"}
      </button>
      {open && (
        <div className="card p-4">
          <LogActivityForm systemId={systemId} target={null} outcomes={outcomes} mentionOptions={mentionOptions} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
