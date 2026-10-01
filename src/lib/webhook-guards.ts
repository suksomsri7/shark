// webhook-guards.ts — composition root ของ "ตัวกันเหตุการณ์" ของปลายทาง webhook (CRM C5.5 ▸ fix1 r2 · มติผู้คุมงานข้อ 5)
//   `src/lib/webhooks/service.ts` โหลดไฟล์นี้ (แบบ lazy) ก่อนรันตัวกันทุกครั้ง ⇒ ตัวกันถูกลงทะเบียนเสมอไม่ว่าคำขอจะมาจากโมดูลไหน
//   (ไม่ต้องพึ่งว่าโมดูล CRM ถูกโหลดในฟังก์ชันนั้นหรือยัง) · แพลตฟอร์มเองไม่ import โมดูลใด — ที่ประกอบข้ามโมดูลมีที่นี่ที่เดียว
//   (แบบเดียวกับ `approval-effects.ts`) · โมดูลใหม่ที่มีเหตุการณ์ "ต้องเห็นทั้งร้าน" ลงทะเบียนเพิ่มที่นี่
import { registerWebhookEventGuard } from "@/lib/webhooks/service";
import { crmPlatformWebhookProblem } from "@/lib/modules/crm";

registerWebhookEventGuard("crm", crmPlatformWebhookProblem);
