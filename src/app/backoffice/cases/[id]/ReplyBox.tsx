"use client";

// กล่องตอบกลับร้าน + ปุ่ม "ให้ AI ร่างคำตอบ" (WO-0047)
// - flow ส่งข้อความเดิมไม่เปลี่ยน: form action={replyAction} + textarea name="body" + ปุ่มส่ง
// - ปุ่ม AI เรียก draftAction (server action → draftCaseReply) แล้วเติมข้อความลง textarea ให้แก้ก่อนกดส่ง
// - ระหว่างรอ = "กำลังร่าง…" · ได้ null (AI ยังไม่พร้อม) = แจ้งสุภาพ ไม่ทับข้อความที่พิมพ์ไว้

import { useState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";

type Props = {
  replyAction: (formData: FormData) => void | Promise<void>;
  draftAction: () => Promise<string | null>;
};

export default function ReplyBox({ replyAction, draftAction }: Props) {
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function onDraft() {
    setDrafting(true);
    setNotice(null);
    try {
      const text = await draftAction();
      if (text && text.trim().length > 0) {
        setBody(text);
      } else {
        setNotice("ระบบ AI ยังไม่พร้อมใช้งานตอนนี้ กรุณาพิมพ์คำตอบเองไปก่อนนะครับ");
      }
    } catch {
      setNotice("ระบบ AI ยังไม่พร้อมใช้งานตอนนี้ กรุณาพิมพ์คำตอบเองไปก่อนนะครับ");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <form action={replyAction} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[color:var(--color-muted)]">
          AI ช่วยร่างได้ แต่ทีมงานตรวจและกดส่งเองเสมอ
        </span>
        <button
          type="button"
          onClick={onDraft}
          disabled={drafting}
          className="btn btn-ghost text-sm disabled:opacity-50"
        >
          {drafting ? "กำลังร่าง…" : "ให้ AI ร่างคำตอบ"}
        </button>
      </div>
      <textarea
        name="body"
        required
        rows={3}
        className="input"
        placeholder="พิมพ์คำตอบถึงร้าน…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {notice && <p className="text-sm text-[color:var(--color-muted)]">{notice}</p>}
      <SubmitButton pendingText="กำลังส่ง…" className="self-end">
        ส่งคำตอบ
      </SubmitButton>
    </form>
  );
}
