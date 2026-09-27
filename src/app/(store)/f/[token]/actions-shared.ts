// actions-shared.ts — ชนิดผลลัพธ์ของการส่งฟอร์มสาธารณะ `/f/<token>` (CRM C3.9 ▸ ย้ายมาจาก `actions.ts`)
//
// 🔴 ทำไมต้องแยกไฟล์: `actions.ts` เป็นไฟล์ "use server" — export ได้เฉพาะ async function เท่านั้น
//    (export type/const จากไฟล์ "use server" = หน้าพัง 500 ตอนรันทั้งที่ build ผ่าน — บทเรียน reference_next_use_server_no_type_export ·
//    ข้อสอบ C3.9-X8.2 กวาดทุกไฟล์ "use server" ของฝั่ง CRM/ฟอร์มสาธารณะ) ⇒ ชนิดที่ทั้งตัว action และหน้า 'use client' ใช้ร่วมกันอยู่ที่นี่ ◂
export type PublicFormActionResult = { ok: true } | { ok: false; message: string };
