"use client";

import { useActionState, useState } from "react";
import {
  updateEndpointEventsAction,
  type UpdateEventsState,
} from "@/lib/webhooks/actions";
import { WEBHOOK_EVENTS, webhookEventLabel } from "@/lib/webhooks/labels";

const initial: UpdateEventsState = { status: "idle" };

/**
 * แก้รายการเหตุการณ์ของปลายทางเดิม — **ไม่แตะรหัสลับ**
 *
 * 🔴 เจ้าของแจ้ง 30 ส.ค. 2026: รอบแรกทำเป็น <details> + <form action={serverAction}> เฉย ๆ
 *    กดแล้ว **ไม่มีอะไรบอกเลยว่าบันทึกไหม** (แผงยังหุบกลับด้วย เพราะหน้าเรนเดอร์ใหม่)
 *    ⇒ ปุ่มที่กดแล้วเงียบ = ผู้ใช้กดซ้ำหรือเดินจากไปทั้งที่ยังไม่รู้ผล
 *    รอบนี้จึงต้องมีครบสามสถานะ: กำลังบันทึก · บันทึกแล้ว(พร้อมบอกว่าตอนนี้รับอะไรบ้าง) · ผิดพลาด
 *    และแผงต้อง **ค้างเปิดไว้** หลังบันทึก ไม่งั้นคำยืนยันจะหายไปพร้อมแผง
 */
export function WebhookEventsEditor({ id, selected }: { id: string; selected: string[] }) {
  const [state, action, pending] = useActionState(updateEndpointEventsAction, initial);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 self-start text-xs text-[color:var(--color-muted)] underline"
      >
        แก้เหตุการณ์ที่รับ
      </button>
    );
  }

  return (
    <form action={action} className="mt-2 flex flex-col gap-1 rounded-lg border px-3 py-2">
      <input type="hidden" name="id" value={id} />
      {WEBHOOK_EVENTS.map((w) => (
        <label key={w.value} className="flex items-start gap-2 text-xs">
          <input
            type="checkbox"
            name="events"
            value={w.value}
            defaultChecked={selected.includes(w.value)}
            className="mt-0.5"
          />
          <span>{w.label}</span>
        </label>
      ))}

      <p className="text-xs text-[color:var(--color-muted)]">
        ไม่ติ๊กเลย = รับทุกเหตุการณ์ · รหัสลับไม่เปลี่ยน ระบบปลายทางไม่ต้องแก้อะไร
      </p>

      {state.status === "error" && (
        <p className="text-xs text-[color:var(--color-danger)]">{state.message}</p>
      )}
      {state.status === "ok" && (
        <p
          data-webhook-events-saved
          className="rounded border border-[color:var(--color-ink)] px-2 py-1 text-xs"
        >
          ✅ บันทึกแล้ว — ตอนนี้ปลายทางนี้รับ:{" "}
          {state.events.length === 0
            ? "ทุกเหตุการณ์"
            : state.events.map((e) => webhookEventLabel(e)).join(" · ")}
        </p>
      )}

      <div className="mt-1 flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn-sm disabled:opacity-50">
          {pending ? "กำลังบันทึก…" : "บันทึกเหตุการณ์"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-[color:var(--color-muted)] underline"
        >
          ปิด
        </button>
      </div>
    </form>
  );
}

export default WebhookEventsEditor;
