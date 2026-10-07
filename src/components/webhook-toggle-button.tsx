"use client";

import { useActionState } from "react";
import { toggleEndpointAction, type ToggleEndpointResult } from "@/lib/webhooks/actions";

type State = ToggleEndpointResult | { ok: null };
const initial: State = { ok: null };

/**
 * ปุ่มเปิด/ปิดปลายทาง webhook (หน้า /app/settings/webhooks)
 *
 * CRM C5.5 ▸ (fix3a · R2-3) เดิมเป็น `<form action={toggleEndpointAction}>` เฉย ๆ ⇒ เมื่อตัวกันเหตุการณ์ปฏิเสธการเปิด action โยน error
 *   ผู้ใช้เห็นหน้า error แทนเหตุผล · ตอนนี้ action คืน `{ok:false, reason}` และปุ่มนี้แสดงเหตุผลไทยใต้ปุ่ม
 *   (สำเร็จ = หน้าเรนเดอร์ใหม่จาก revalidatePath — สถานะ "เปิดอยู่/ปิดอยู่" บนการ์ดคือคำยืนยัน) ◂
 */
export function WebhookToggleButton({ id, active }: { id: string; active: boolean }) {
  const [state, action, pending] = useActionState(
    async (_prev: State, fd: FormData): Promise<State> => toggleEndpointAction(fd),
    initial,
  );
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <button type="submit" disabled={pending} className="btn-sm disabled:opacity-50">
        {pending ? "กำลังบันทึก…" : active ? "ปิด" : "เปิด"}
      </button>
      {state.ok === false && (
        <p role="alert" className="max-w-56 text-right text-xs text-[color:var(--color-danger)]">
          {state.reason}
        </p>
      )}
    </form>
  );
}
