"use client";

import { useFormStatus } from "react-dom";

// ปุ่ม submit ที่ disable ตัวเองระหว่างส่ง — กันกดซ้ำ = บันทึกเงินซ้ำ
// ใช้ในทุก server-action form ที่แตะเงิน/สร้างเอกสาร
type Props = {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "ghost";
  className?: string;
};

export function SubmitButton({
  children,
  pendingText = "กำลังบันทึก…",
  variant = "primary",
  className = "",
}: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`btn btn-${variant} text-sm disabled:opacity-50 ${className}`}
    >
      {pending ? pendingText : children}
    </button>
  );
}

export default SubmitButton;
