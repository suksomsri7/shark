// meeting/index.ts — facade ของโมดูลแชททีม (MEETING) สำหรับโค้ดนอกโมดูล (ใบ CRM v2 C3.4 · addendum ข้อ 3 · มติผู้คุมงาน (4))
//
// 🔴 re-export ล้วน — ไม่มีตรรกะที่นี่ · ผู้ใช้วันนี้: CRM (`crm/ai-bridges.ts` แจ้งห้องทีม · ตัวเลือกห้องบนหน้าตั้งค่า CRM)
//    ผ่านเส้น `crm→meeting` ใน ALLOWED_EDGES (scripts/fitness.mts) · โหลดแบบ dynamic import จากฝั่ง CRM
// 🔴 ของที่เปิด = เท่าที่คนนอกใช้จริงเท่านั้น (โพสต์ในนามระบบ + รายการห้องให้เลือก)
export { postSystemMessage, listRoomOptions, liveChannelIds, maskSystemMessagesInTx, MEETING_SYSTEM_AUTHOR_PREFIX } from "./service";
