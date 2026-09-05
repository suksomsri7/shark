"use client";

// DocTagsBlock.tsx — แท็กของเอกสาร 1 ใบ พร้อมปุ่มลบทีละแท็ก (WO 9.4 §0.3 ข้อ 8/9)
// ยังไม่เคยมี UI ลบแท็กออกจากเอกสารมาก่อน (ก่อนหน้านี้แท็กตั้งได้แค่ตอนสร้าง/แก้ไขฟอร์มเท่านั้น) — ตัวนี้เป็นจุดแรก
// ลบแท็ก "ไม่กินเลขที่/ไม่ลงเงิน" ⇒ เลิกทำได้ภายใน 5 นาทีเหมือนการกระทำอื่นในกลุ่มเดียวกัน
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeDocTagWithUndoAction } from "@/lib/modules/account/undo-stack";
import { useUndoToast } from "./UndoToast";

export function DocTagsBlock({ systemId, docId, tags }: { systemId: string; docId: string; tags: string[] }) {
  const router = useRouter();
  const undoToast = useUndoToast();
  const [pending, start] = useTransition();

  const removeTag = (tag: string) =>
    start(async () => {
      const res = await removeDocTagWithUndoAction(systemId, docId, tag);
      if (res.ok) {
        undoToast.show({ tokenId: res.undoToken, systemId, message: `ลบแท็ก "${tag}" แล้ว` });
        router.refresh();
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="doc-tags">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
          style={{ borderColor: "var(--color-line)" }}
          data-testid={`doc-tag-${t}`}
        >
          {t}
          <button
            type="button"
            aria-label={`ลบแท็ก ${t}`}
            disabled={pending}
            onClick={() => removeTag(t)}
            className="text-[color:var(--color-muted)] hover:text-[color:var(--color-danger)]"
            data-testid={`doc-tag-remove-${t}`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

export default DocTagsBlock;
