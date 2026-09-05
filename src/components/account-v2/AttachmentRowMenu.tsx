"use client";

// AttachmentRowMenu.tsx — "ทำรายการ ▾" ต่อแถวของคลังเอกสาร V2 (f9-documents-menu.png):
// ดูตัวอย่างไฟล์ · สร้างเอกสารจากไฟล์/แนบกับเอกสารที่มีอยู่ (เฉพาะยังไม่ผูก) · แยกออกจากเอกสาร (เฉพาะผูกแล้ว) ·
// เปลี่ยนประเภท · ย้ายโฟลเดอร์ · ดาวน์โหลด · ลบไฟล์ (แดง, ConfirmDialog → ลบนุ่ม)
// WO 7.1 round 2 — ใช้ `RowActions` (ปุ่มมีป้าย "ทำรายการ ▾" ตาม f9 จริง) แทน `DocMoreMenu` (ปุ่มกลม "⋯" เปล่า
// ที่ใช้ในหน้าเอกสาร 1 ใบ §5.3 — คนละบริบทกับหน้ารายการ §1/§3 ที่ f9 อ้างถึง)
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RowActions, type RowActionItem } from "./RowActions";
import { AttachmentPreviewModal, AttachDocumentModal, MoveFolderModal, ChangeTypeModal } from "./AttachmentModals";
// WO 9.4 §0.3 ข้อ 8 — เก็บถาวร/แยกออกจากเอกสาร ไม่กินเลขที่/ไม่ลงเงิน ⇒ เลิกทำได้ภายใน 5 นาที
import { unlinkAttachmentWithUndoAction, archiveAttachmentWithUndoAction } from "@/lib/modules/account/undo-stack";
import { useUndoToast } from "./UndoToast";

export function AttachmentRowMenu({
  systemId,
  attachmentId,
  fileName,
  fileUrl,
  mimeType,
  folder,
  folders,
  docTypeHint,
  linked,
  createExpenseHref,
}: {
  systemId: string;
  attachmentId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  folder: string | null;
  folders: string[];
  docTypeHint: string | null;
  linked: boolean;
  createExpenseHref: string;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();
  const undoToast = useUndoToast();

  const items: RowActionItem[] = [
    { label: "ดูตัวอย่างไฟล์", icon: "eye", onClick: () => setPreviewOpen(true) },
    ...(linked
      ? [
          {
            label: "แยกออกจากเอกสาร",
            icon: "swap",
            onClick: () =>
              start(async () => {
                const res = await unlinkAttachmentWithUndoAction(systemId, attachmentId);
                if (res.ok) {
                  undoToast.show({ tokenId: res.undoToken, systemId, message: `แยก "${fileName}" ออกจากเอกสารแล้ว` });
                  router.refresh();
                }
              }),
          },
        ]
      : [
          { label: "สร้างเอกสารจากไฟล์", icon: "plus", href: createExpenseHref },
          { label: "แนบกับเอกสารที่มีอยู่", icon: "link", onClick: () => setAttachOpen(true) },
        ]),
    { label: "เปลี่ยนประเภท", icon: "edit", onClick: () => setTypeOpen(true) },
    { label: "ย้ายโฟลเดอร์", icon: "folder", onClick: () => setFolderOpen(true) },
    { label: "ดาวน์โหลด", icon: "download", href: fileUrl },
  ];

  return (
    <>
      <RowActions
        testId={`attachment-row-menu-${attachmentId}`}
        items={items}
        danger={{
          icon: "trash",
          triggerLabel: "ลบไฟล์",
          title: `ลบไฟล์ "${fileName}"?`,
          detail: "ลบแล้วไฟล์จะหายจากคลังเอกสาร — กู้คืนได้ภายหลังโดยผู้ดูแลระบบ (ไม่ลบไฟล์จริงจากที่เก็บ)",
          confirmLabel: "ยืนยันลบ",
          // AttachmentRowMenu เป็น client component อยู่แล้ว ⇒ ผูก closure ตรงนี้ได้เลย (ไม่ต้องพึ่ง redirect+query
          // แบบ contacts-ui.tsx/products/page.tsx ที่เป็น server component) — ConfirmDialog แค่ต้องการฟังก์ชัน
          // รูปร่าง (formData) => void|Promise<void> ไม่จำเป็นต้องเป็น "use server" action โดยตรง
          action: async (fd: FormData) => {
            const sid = String(fd.get("systemId") ?? "");
            const aid = String(fd.get("id") ?? "");
            const res = await archiveAttachmentWithUndoAction(sid, aid);
            if (res.ok) {
              undoToast.show({ tokenId: res.undoToken, systemId: sid, message: `เก็บถาวร "${fileName}" แล้ว` });
              router.refresh();
            }
          },
          fields: { systemId, id: attachmentId },
        }}
      />
      <AttachmentPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} fileName={fileName} fileUrl={fileUrl} mimeType={mimeType} />
      <AttachDocumentModal open={attachOpen} onClose={() => setAttachOpen(false)} systemId={systemId} attachmentId={attachmentId} fileName={fileName} />
      <MoveFolderModal open={folderOpen} onClose={() => setFolderOpen(false)} systemId={systemId} ids={[attachmentId]} folders={folders} currentFolder={folder} />
      <ChangeTypeModal open={typeOpen} onClose={() => setTypeOpen(false)} systemId={systemId} attachmentId={attachmentId} initialValue={docTypeHint} linked={linked} />
    </>
  );
}

export default AttachmentRowMenu;
