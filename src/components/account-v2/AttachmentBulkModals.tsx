"use client";

// AttachmentBulkModals.tsx — bulk "ย้ายโฟลเดอร์"/"ลบ" ของคลังเอกสาร V2 (WO 7.1)
// เปิดผ่าน query `?bulkIds=&bulkOp=move|delete` (ปุ่ม bulk bar ของ DocTable ยิง selectionAction มาที่นี่ —
// pattern เดียวกับ MarkFiledModal ของ WO 5.4: URL กำหนดว่าใครถูกเลือก โมดัลแค่ยืนยัน+เรียก server action)
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { MoveFolderModal } from "./AttachmentModals";
import { archiveAttachmentsBulkAction } from "@/app/app/sys/[id]/account/documents/actions";

export function AttachmentBulkModals({
  systemId,
  closeHref,
  op,
  ids,
  folders,
}: {
  systemId: string;
  closeHref: string;
  op: "move" | "delete" | null;
  ids: string[];
  folders: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const close = () => router.push(closeHref);

  if (op === "move") {
    return <MoveFolderModal open onClose={close} systemId={systemId} ids={ids} folders={folders} />;
  }
  if (op === "delete") {
    return (
      <Modal open onClose={close} size="sm" sheetOnMobile testId="bulk-delete-modal" title={`ลบไฟล์ ${ids.length} รายการ?`}>
        <p className="text-sm text-[color:var(--color-muted)]">
          ลบแล้วไฟล์จะหายจากคลังเอกสาร — กู้คืนได้ภายหลังโดยผู้ดูแลระบบ (ไม่ลบไฟล์จริงจากที่เก็บ)
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={close}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ background: "var(--color-danger)" }}
            disabled={pending}
            onClick={() =>
              start(async () => {
                await archiveAttachmentsBulkAction(systemId, ids);
                close();
              })
            }
            data-testid="bulk-delete-confirm"
          >
            {pending ? "กำลังลบ…" : "ยืนยันลบ"}
          </button>
        </div>
      </Modal>
    );
  }
  return null;
}

export default AttachmentBulkModals;
