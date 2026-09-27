// kb/index.ts — facade ของคลังความรู้ (KB) สำหรับโค้ดนอกโมดูล (ใบ CRM v2 C3.4 · addendum ข้อ 10 · มติผู้คุมงาน (4))
//
// 🔴 re-export ล้วน — ไม่มีตรรกะที่นี่ · ผู้ใช้วันนี้: CRM (`crm/kb-tokens.ts` — ร่างอีเมล/สรุปของผู้ช่วย AI อ้างบทความของร้าน ·
//    `{{kb:<articleId>}}` ในแม่แบบอีเมล) ผ่านเส้น `crm→kb` ใน ALLOWED_EDGES (scripts/fitness.mts) · โหลดแบบ dynamic import
// 🔴 ทุกฟังก์ชันผูกร้านผ่าน `tenantDb({ tenantId })` ของ service อยู่แล้ว ⇒ บทความของร้านอื่นไม่มีทางโผล่
export { searchKb, getArticle } from "./service";
export type { SearchHit } from "./service";
