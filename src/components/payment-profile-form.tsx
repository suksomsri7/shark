"use client";

import { useActionState, useState } from "react";
import { savePaymentProfileAction, type SavePaymentState } from "@/lib/payment/actions";
import { promptpayPayload, isValidPromptPayId } from "@/lib/payment/promptpay";
import { formatBaht } from "@/lib/ui/money";
import { FormField } from "@/components/ui/FormField";
import { PromptPayQr } from "@/components/PromptPayQr";

const initial: SavePaymentState = { status: "idle" };

// ฟอร์มตั้งช่องรับเงิน PromptPay + พรีวิว QR สด (พิมพ์ปุ๊บเห็นปั๊บ)
// การคำนวณ payload เป็น pure (promptpay.ts) → รันฝั่ง client ได้เลย ไม่ต้องยิง server
export function PaymentProfileForm({
  defaultPromptpayId,
  defaultDisplayName,
}: {
  defaultPromptpayId: string;
  defaultDisplayName: string;
}) {
  const [state, action, pending] = useActionState(savePaymentProfileAction, initial);
  const [promptpayId, setPromptpayId] = useState(defaultPromptpayId);
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [testBaht, setTestBaht] = useState(""); // จำนวนเงินทดสอบ (บาท) — ว่าง = QR แบบไม่ล็อกยอด

  // แปลงบาทที่พิมพ์ → สตางค์ (เฉพาะเมื่อเป็นตัวเลข > 0)
  const baht = Number(testBaht);
  const amountSatang = testBaht.trim() !== "" && Number.isFinite(baht) && baht > 0
    ? Math.round(baht * 100)
    : undefined;

  // payload พรีวิว — ผิด/ยังไม่กรอก → null (PromptPayQr แสดงกล่องช่วยเหลือ)
  let payload: string | null = null;
  if (isValidPromptPayId(promptpayId)) {
    try {
      payload = promptpayPayload({ id: promptpayId, amountSatang });
    } catch {
      payload = null;
    }
  }

  const caption = displayName.trim()
    ? displayName.trim()
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <FormField
          label="PromptPay ID"
          required
          hint="เบอร์มือถือ 10 หลัก (เช่น 0812345678) หรือเลขบัตรประชาชน 13 หลัก"
        >
          <input
            name="promptpayId"
            value={promptpayId}
            onChange={(e) => setPromptpayId(e.target.value)}
            inputMode="numeric"
            placeholder="0812345678"
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
          />
        </FormField>

        <FormField label="ชื่อบัญชี / ชื่อร้าน (โชว์ใต้ QR)" hint="เว้นว่างได้">
          <input
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="เช่น ร้านกาแฟสุขใจ"
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
          />
        </FormField>

        {state.status === "error" && (
          <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
        )}
        {state.status === "ok" && (
          <p className="text-sm font-medium">✅ บันทึกช่องรับเงินเรียบร้อย</p>
        )}

        <button type="submit" disabled={pending} className="btn btn-primary disabled:opacity-50">
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </form>

      <div className="card flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">พรีวิว QR</h2>
          <span className="text-xs text-[color:var(--color-muted)]">
            {amountSatang ? `ล็อกยอด ${formatBaht(amountSatang)}` : "ไม่ล็อกยอด (ลูกค้ากรอกเอง)"}
          </span>
        </div>

        <FormField label="จำนวนเงินทดสอบ (บาท)" hint="เว้นว่าง = QR แบบไม่ล็อกยอด">
          <input
            value={testBaht}
            onChange={(e) => setTestBaht(e.target.value)}
            inputMode="decimal"
            placeholder="เช่น 150.50"
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
          />
        </FormField>

        <PromptPayQr payload={payload} caption={caption} />
      </div>
    </div>
  );
}

export default PaymentProfileForm;
