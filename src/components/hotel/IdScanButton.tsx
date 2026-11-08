"use client";
// SVC H.4 ▸ ปุ่ม "สแกนพาสปอร์ต" — แสดงเฉพาะเมื่อร้านเปิด rooms.hotel.guest.aiIdReader (aiEnabled) · ระบบเสนอค่า พนักงานยืนยันทุกช่องก่อนบันทึก (aiProposed)
//   ถ่าย/เลือกรูป → readIdDocumentAction → ค่าเสนอใส่ฟอร์ม · ไม่มีคีย์/เครดิตหมด/อ่านไม่ออก ⇒ แจ้งให้กรอกเอง (ไม่บล็อก)
//   รูปเดียวกันใช้เป็นสำเนาเอกสารได้ถ้าแขกยินยอม (keepIdImage ติ๊กต่อครั้งในฟอร์ม)
import { useState } from "react";
import { readIdDocumentAction } from "@/lib/modules/hotel/actions";
import { FILE_MAX_BYTES, readFileAsDataUrl, type IdProposal } from "./checkin-shared";

type Props = { unitSlug: string; aiEnabled: boolean; onProposal: (p: IdProposal, imageDataUrl: string) => void; onImage: (imageDataUrl: string) => void };

export default function IdScanButton({ unitSlug, aiEnabled, onProposal, onImage }: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const pick = async (file: File | null | undefined) => {
    if (!file) return;
    if (file.size > FILE_MAX_BYTES) {
      setMsg("รูปใหญ่เกิน 8 MB — ถ่ายใหม่ให้เล็กลง");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onImage(dataUrl);
      if (!aiEnabled) return;
      const r = await readIdDocumentAction(unitSlug, { image: { dataUrl } });
      if (r.ok && r.proposal && typeof r.proposal === "object") {
        onProposal(r.proposal as IdProposal, dataUrl);
        setMsg("ระบบกรอกข้อมูลจากรูปให้แล้ว — ตรวจทุกช่องแล้วติ๊กยืนยันก่อนบันทึก");
      } else setMsg(typeof r.reason === "string" ? r.reason : "อ่านไม่สำเร็จ — กรอกข้อมูลเอง");
    } catch {
      setMsg("อ่านรูปไม่สำเร็จ — กรอกข้อมูลเองได้เลย");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-id-scan={aiEnabled ? "ai" : "photo"} className="flex min-w-0 flex-col gap-1">
      <label className="flex h-28 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] text-sm text-[color:var(--color-muted)]">
        <span>{busy ? "กำลังอ่าน…" : aiEnabled ? "สแกนพาสปอร์ต" : "ถ่ายรูปบัตร/พาสปอร์ต"}</span>
        <span className="text-xs">{aiEnabled ? "ระบบกรอกให้ · พนักงานตรวจก่อนบันทึก" : "เก็บเป็นสำเนา (ถ้าแขกยินยอม)"}</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" capture="environment" className="sr-only" disabled={busy} onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
      {msg ? (
        <p role="status" className="text-xs text-[color:var(--color-muted)]">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
