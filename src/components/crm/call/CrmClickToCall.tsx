"use client";

// CrmClickToCall — ปุ่ม "โทร" ที่กดแล้ว **เปิดสายจริง** และ **เปิดโมดัลบันทึกการโทร** พร้อมกัน (CRM v2 · ใบ C2.4 · ภาพ 08 ซ้าย)
//
// 🔴 ทำไมต้องเป็นลิงก์ `tel:` จริง ๆ ไม่ใช่ปุ่มที่เรียก JS: บนมือถือ (ที่เซลส์ใช้จริง) `tel:` เป็นทางเดียวที่ระบบปฏิบัติการ
//    จะขึ้นหน้าโทรออกให้ · ปุ่มที่ดักคลิกแล้วเรียก `window.location` เองจะถูกบล็อกในบางเบราว์เซอร์/ในโปรแกรมที่ฝังหน้าเว็บ
// 🔴 กดครั้งเดียวได้สองอย่าง: ปล่อยให้ลิงก์ทำงานตามปกติ (ไม่ `preventDefault`) แล้วเปิดโมดัลไว้รอ ⇒ พอวางสายกลับมาก็กรอกผลได้ทันที
//    (ถ้าไม่มีเบอร์ = ไม่มีลิงก์ให้กด แต่ยังบันทึกสายย้อนหลังได้ด้วยปุ่ม "บันทึกสาย")
// 🔴 'use client' — ไม่ import โมดูลที่ลากกราฟ prisma (ค่า/สถานะที่ต้องใช้มาเป็น prop จากหน้าฝั่งเซิร์ฟเวอร์)

import { useState } from "react";
import { CrmCallLogModal } from "./CrmCallLogModal";
import type { CrmCallAiState, CrmCallLogTarget } from "./types";

export type CrmClickToCallProps = {
  systemId: string;
  target: CrmCallLogTarget;
  /** เบอร์ของผู้ติดต่อ (ไม่มี = แสดงเฉพาะปุ่มบันทึกสายย้อนหลัง) */
  phone?: string | null;
  outcomes: string[];
  maxRecordingBytes: number;
  aiState: CrmCallAiState;
  aiMessage: string;
  /** ป้ายบนปุ่ม (ปริยาย "โทร") */
  label?: string;
  /**
   * หน้าไหนเป็นคนแสดงปุ่มนี้ (ใบ C2.4 รอบ 2 · ข้อ N18) — ตัดสิน testid ของปุ่ม "บันทึกสาย" (กรณีไม่มีเบอร์)
   * 🔴 ทะเบียนปุ่มมีหนึ่งแถวต่อ testid (ด่าน F14.2 ห้ามซ้ำ) ⇒ ปุ่มเดียวกันที่โผล่สองหน้าต้องมี testid ของตัวเอง
   *    ไม่งั้นทะเบียนจะโกหกว่า "ปุ่มนี้มีแต่บนหน้าดีล" ทั้งที่ผู้ติดต่อที่ไม่มีเบอร์ก็เห็นปุ่มนี้
   */
  page?: "contact" | "deal";
};

/** เบอร์สำหรับ `tel:` — เก็บเฉพาะตัวเลขกับ + (ช่องว่าง/ขีดทำให้บางเครื่องกดไม่ติด) */
const telOf = (phone: string): string => phone.replace(/[^\d+]/g, "");

export function CrmClickToCall({ systemId, target, phone, outcomes, maxRecordingBytes, aiState, aiMessage, label = "โทร", page = "deal" }: CrmClickToCallProps) {
  const [open, setOpen] = useState(false);
  const tel = phone ? telOf(phone) : "";
  return (
    <>
      {tel ? (
        <a href={`tel:${tel}`} className="btn btn-ghost text-sm" onClick={() => setOpen(true)} data-testid="crm-call-tel">
          ☎ {label}
        </a>
      ) : page === "contact" ? (
        <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(true)} data-testid="crm-call-log-open-contact">
          ☎ บันทึกสาย
        </button>
      ) : (
        <button type="button" className="btn btn-ghost text-sm" onClick={() => setOpen(true)} data-testid="crm-call-log-open">
          ☎ บันทึกสาย
        </button>
      )}
      {open && (
        <CrmCallLogModal systemId={systemId} target={target} outcomes={outcomes} maxRecordingBytes={maxRecordingBytes} aiState={aiState} aiMessage={aiMessage} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
