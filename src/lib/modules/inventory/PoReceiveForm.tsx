"use client";

import { useActionState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { receivePoAction } from "./procurement-actions";

// ปุ่ม "รับของ" ของใบสั่งซื้อ (HF-INV-1 R3.8) — เรียก receivePoAction ผ่าน useActionState แล้วแสดงข้อความไทยที่ได้กลับมา
// (เดิมผูก action ตรงกับ <form>/ConfirmDialog ⇒ ผลถูกทิ้ง และข้อความที่ throw ถูก Next ปิดบังใน production)
// หลายคลัง = เลือกคลังปลายทางในฟอร์ม · คลังเดียว = กล่องยืนยันเดิม · กดซ้ำ action ตอบสำเร็จเอง (ไม่รับซ้ำ ไม่ขึ้น error)
type ReceiveState = { status: "idle" } | { status: "ok" | "error"; message: string };

export default function PoReceiveForm({
  systemId,
  poId,
  code,
  totalQty,
  lineCount,
  locations,
}: {
  systemId: string;
  poId: string;
  code: string;
  totalQty: number;
  lineCount: number;
  /** หลายคลัง = รายการคลังให้เลือก · null = คลังเดียว (ใช้กล่องยืนยัน) */
  locations: { id: string; name: string }[] | null;
}) {
  const [state, formAction] = useActionState<ReceiveState, FormData>(async (_prev, formData) => receivePoAction(formData), {
    status: "idle",
  });
  return (
    <div className="flex flex-col items-end gap-1">
      {locations && locations.length > 0 ? (
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="systemId" value={systemId} />
          <input type="hidden" name="poId" value={poId} />
          <select name="locationId" className="input py-1 text-sm" defaultValue={locations[0].id} aria-label="รับเข้าคลัง">
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <SubmitButton>รับของ</SubmitButton>
        </form>
      ) : (
        <ConfirmDialog
          triggerLabel="รับของ"
          triggerClassName="btn btn-primary text-sm"
          title={`รับของเข้าคลัง — ${code}?`}
          detail={`จะเพิ่มสต็อก ${totalQty.toLocaleString("th-TH")} ชิ้น จาก ${lineCount.toLocaleString("th-TH")} รายการ`}
          confirmLabel="ยืนยันรับของ"
          action={formAction}
          fields={{ systemId, poId }}
        />
      )}
      {state.status === "error" && (
        <p role="alert" className="max-w-xs text-right text-xs text-[color:var(--color-danger)]">
          {state.message}
        </p>
      )}
    </div>
  );
}
