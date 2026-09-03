"use client";

import { useState, useTransition } from "react";
import { getOrCreatePublicLinkAction } from "@/lib/modules/account/actions";

// ปุ่มรอง "แชร์ลิงก์" บนหัวหน้าเอกสาร V2 (§5.3) — สร้าง token ถ้ายังไม่มีแล้วคัดลอกลิงก์สาธารณะ /r/<token>
// ใช้ได้เฉพาะเอกสารที่ ensurePublicTaxInvoiceLink รองรับ (RECEIPT/DEPOSIT_RECEIPT/INVOICE ที่ออกแล้ว)
export function ShareLinkButton({ systemId, docId, disabled }: { systemId: string; docId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  if (disabled) {
    return (
      <button type="button" className="btn btn-ghost text-sm" disabled title="เร็ว ๆ นี้" data-testid="btn-share-link">
        แชร์ลิงก์
      </button>
    );
  }

  const onClick = () =>
    start(async () => {
      setMsg("");
      const res = await getOrCreatePublicLinkAction(systemId, docId);
      if (!res.ok) {
        setMsg(res.reason);
        return;
      }
      const url = `${window.location.origin}/r/${res.token}`;
      try {
        await navigator.clipboard.writeText(url);
        setMsg("คัดลอกลิงก์แล้ว");
      } catch {
        setMsg(url);
      }
      window.setTimeout(() => setMsg(""), 3000);
    });

  return (
    <span className="relative">
      <button
        type="button"
        className="btn btn-ghost text-sm"
        onClick={onClick}
        disabled={pending}
        data-testid="btn-share-link"
      >
        {pending ? "กำลังสร้างลิงก์…" : "แชร์ลิงก์"}
      </button>
      {msg && (
        <span
          role="status"
          className="absolute left-0 top-full z-10 mt-1 whitespace-nowrap rounded-lg border bg-[color:var(--color-surface)] px-2 py-1 text-xs shadow-[0_8px_24px_rgba(10,10,10,.08)]"
          data-testid="share-link-msg"
        >
          {msg}
        </span>
      )}
    </span>
  );
}

export default ShareLinkButton;
