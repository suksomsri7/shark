"use client";

import { useFormStatus } from "react-dom";

// ปุ่ม submit ที่ disable ตัวเองระหว่างส่ง — กันกดซ้ำ = บันทึกเงินซ้ำ
// ใช้ในทุก server-action form ที่แตะเงิน/สร้างเอกสาร
type Props = {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "ghost";
  className?: string;
  /** ผูกปุ่มกับ <form id="..."> ที่อยู่คนละที่ในหน้า (เช่น ปุ่มอยู่ในเซลล์ตาราง — <form> วางใน <tr> ไม่ได้) */
  form?: string;
  /** POS P4.1 ▸ R5: data-testid (ไม่บังคับ) ส่งต่อไปที่ปุ่ม — ทะเบียนปุ่ม POS (F15.3) นับ testid ที่จุดเรียก ◂ */
  "data-testid"?: string;
};

export function SubmitButton({
  children,
  pendingText = "กำลังบันทึก…",
  variant = "primary",
  className = "",
  form,
  "data-testid": testId, // POS P4.1 ▸ R5 ◂
}: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      form={form}
      data-testid={testId} // POS P4.1 ▸ R5 ◂
      disabled={pending}
      className={`btn btn-${variant} text-sm disabled:opacity-50 ${className}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}

export default SubmitButton;
