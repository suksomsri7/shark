// crm-panel-shared.ts — ชนิดข้อมูลของแผงข้าง "CRM" ในห้องแชท (ใบ C1.11) · ไฟล์บริสุทธิ์ (client component import ได้)
// ผลของ `getChatCrmPanelAction` — `data: null` = ร้านยังไม่มีระบบ CRM ที่เปิด CRM ใหม่ / ผู้ดูไม่มีคีย์ CRM (แผงไม่แสดง)

export type ChatCrmPanelDeal = { id: string; title: string; valueSatang: number; stageName: string };

export type ChatCrmPanelData = {
  systemId: string;
  /** visible = เห็นผู้ติดต่อ · hidden = มีแต่อยู่นอกขอบเขตของผู้ดู (ถ้อยคำกลาง ๆ · ไม่มีปุ่มสร้าง lead) · none = ยังไม่อยู่ใน CRM แน่นอน */
  contactState: "visible" | "hidden" | "none";
  contact: { id: string; name: string; lifecycleStage: string; leadStatus: string } | null;
  company: { id: string; name: string } | null;
  openDeals: ChatCrmPanelDeal[];
  score: { value: number; band: string | null } | null;
  /** ปุ่มที่ผู้ดูกดได้จริง (ไม่มีคีย์ = ไม่โชว์ปุ่ม) */
  can: { createLead: boolean; logActivity: boolean; openDeal: boolean };
};

export type ChatCrmPanelResult = { ok: true; data: ChatCrmPanelData | null } | { ok: false; error: string; code?: string };

export const CHAT_CRM_ACTIVITY_TYPES = [
  { value: "NOTE", label: "โน้ต" },
  { value: "CALL", label: "โทร" },
  { value: "CHAT", label: "คุยแชท" },
  { value: "MEETING", label: "นัดพบ" },
] as const;
