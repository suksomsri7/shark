// types.ts — ชนิดข้อมูลที่หน้า server ส่งให้คอมโพเนนต์ฝั่ง client ของ "บันทึกการโทร" (ใบ C2.4 · ภาพ 08 ซ้าย)
//
// 🔴 ไฟล์นี้ไม่ import อะไรเลย — ด่าน F2.3 ของ fitness ห้าม `src/components/**` ล้วงโมดูล CRM (แม้แต่ไฟล์ `*-shared`)
//    ⇒ เพดานขนาดไฟล์ · ทะเบียนผลสาย · สถานะผู้ช่วย AI มาจากหน้า server ทาง props ทั้งชุด (หน้าอยู่ใน self-dir ของ CRM)
//    รูปเดียวกับ `src/components/crm/assignment/types.ts` ของใบ C2.3
// 🔴 ต้นฉบับของชนิดพวกนี้คือ `src/lib/modules/crm/calls-shared.ts` — หน้า server เป็นคนต่อสองฝั่งเข้าหากัน
//    ⇒ ถ้าฝั่งบริการเพิ่ม/เปลี่ยนค่า (เช่น สถานะ AI ตัวที่ห้า) หน้าที่ส่ง prop จะคอมไพล์ไม่ผ่านทันที (ไม่ใช่เพี้ยนเงียบ)

/** สถานะปุ่ม "ถอดเสียง" — ตรงกับ `CallAiState` ของ `crm/calls-shared.ts` */
export type CrmCallAiState = "OFF" | "NO_PROVIDER" | "NO_CREDIT" | "READY";

/**
 * ข้อเสนอของผู้ช่วย AI ที่ยังรออยู่ (แก้ได้ในการ์ด · ลงแถวกิจกรรมเมื่อกดรับ)
 * `working: true` = จองงานไว้แล้วแต่ยังถอดเสียงไม่เสร็จ ⇒ ยังไม่มีเนื้อให้ตรวจ และปุ่ม "บันทึกผลนี้" ต้องกดไม่ได้
 * (ถ้ากดได้ ค่าว่างจะทับ transcript/สรุปที่มีอยู่เป็น NULL — ใบ C2.4 รอบ 2 ข้อ B2)
 */
export type CrmCallAiProposal = { proposalId: string; transcript: string; aiSummary: string; aiNextStep: string; working?: boolean; message?: string };

/** ร่างที่โมเดลอ่านได้จากนามบัตร */
export type CrmCallCardDraft = { name: string; phone: string; email: string; company: string; jobTitle: string };

/** ระเบียนที่สายนี้ผูกอยู่ (อย่างน้อยหนึ่งช่อง) */
export type CrmCallLogTarget = { contactId?: string | null; dealId?: string | null; companyId?: string | null };

/** รูปคำตอบของ server action ที่คอมโพเนนต์รับได้ — ล้ม = ข้อความไทยที่ไม่โทษผู้ใช้ (แสดง inline ไม่ใช้กล่องเตือนของเบราว์เซอร์) */
export type CrmCallFail = { ok: false; error: string; code?: string };
